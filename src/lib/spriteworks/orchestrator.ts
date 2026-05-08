import {
  ATLAS_COLS,
  ATLAS_ROWS,
  type PipelineResult,
  type RGB,
  type RowSpec,
  type SpriteworksJob,
  BOOA_C64_PALETTE,
  pickGenerationGrid,
} from './types';
import { processImageData, extractPalette } from './pipeline';
import {
  cropImageData,
  extractComponentFrames,
  extractSlotFrames,
  imageDataToBlob,
  imageDataToDataUrl,
  pasteImageData,
  resizeNearest,
} from './extract';
import { buildSpritePrompt, buildExtendPrompt } from './prompt';
import { generateSpriteAtlasGemini, generateExtendedBodyGemini } from './gemini';
import { generateSpriteAtlasOpenAI, generateExtendedBodyOpenAI } from './openai';

export type ProgressEvent =
  | { stage: 'extend-start'; provider: string }
  | { stage: 'extend-done'; bytes: number }
  | { stage: 'gen-start'; provider: string; genCols: number; genRows: number; outCols: number; outRows: number }
  | { stage: 'gen-done'; bytes: number }
  | { stage: 'pipeline-start' }
  | { stage: 'pipeline-done'; paletteSize: number }
  | { stage: 'extract-start' }
  | { stage: 'extract-done'; frames: number }
  | { stage: 'gifs-start' }
  | { stage: 'gifs-done'; count: number }
  | { stage: 'contact-done' }
  | { stage: 'identity-done'; overlap: number };

export type ProgressCallback = (e: ProgressEvent) => void;

function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

async function dataUrlToImageData(dataUrl: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    img.onerror = () => reject(new Error(`failed to load image (${dataUrl.slice(0, 80)}…)`));
    img.src = dataUrl;
  });
}

function base64ToDataUrl(b64: string): string {
  return `data:image/png;base64,${b64}`;
}

// All gen rows share the source state name so the rebuild step can collect
// every extracted frame as one flat sequence keyed by that single state.
function splitForGenGrid(source: RowSpec, genCols: number, genRows: number): RowSpec[] {
  const out: RowSpec[] = [];
  let consumed = 0;
  for (let r = 0; r < genRows; r++) {
    const remaining = source.frames - consumed;
    if (remaining <= 0) break;
    const frames = Math.min(genCols, remaining);
    const slicedDurations = source.durations_ms.slice(consumed, consumed + frames);
    out.push({
      row: r,
      state: source.state,
      frames,
      durations_ms:
        slicedDurations.length === frames
          ? slicedDurations
          : Array(frames).fill(source.durations_ms[0] ?? 120),
    });
    consumed += frames;
  }
  return out;
}

function paletteOverlap(atlas: ImageData, avatarPalette: RGB[], toleranceSq = 400): number {
  const data = atlas.data;
  let opaque = 0;
  let onPalette = 0;
  const cache = new Map<number, boolean>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    opaque++;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = (r << 16) | (g << 8) | b;
    let hit = cache.get(key);
    if (hit === undefined) {
      hit = false;
      for (const c of avatarPalette) {
        const dr = r - c[0], dg = g - c[1], db = b - c[2];
        if (dr * dr + dg * dg + db * db <= toleranceSq) { hit = true; break; }
      }
      cache.set(key, hit);
    }
    if (hit) onPalette++;
  }
  return opaque === 0 ? 0 : onPalette / opaque;
}

async function renderGifFromFrames(
  frames: ImageData[],
  durations: number[],
  cellW: number,
  cellH: number,
): Promise<Blob> {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  const encoder = GIFEncoder();
  // Quantize once across all frames so the GIF uses a single shared palette.
  const cellPx = cellW * cellH;
  const all = new Uint8ClampedArray(cellPx * frames.length * 4);
  for (let f = 0; f < frames.length; f++) {
    all.set(frames[f].data, f * cellPx * 4);
  }
  const palette = quantize(all, 64, { format: 'rgba4444' });

  for (let i = 0; i < frames.length; i++) {
    const data = frames[i].data;
    const indexed = applyPalette(data, palette, 'rgba4444');
    // applyPalette discards alpha; route fully-transparent pixels to index 0
    // and declare 0 as the GIF's transparent color.
    const transparentIndex = 0;
    for (let p = 0; p < indexed.length; p++) {
      if (data[p * 4 + 3] < 128) indexed[p] = transparentIndex;
    }
    encoder.writeFrame(indexed, cellW, cellH, {
      palette,
      delay: durations[i] || 120,
      transparent: true,
      transparentIndex,
      dispose: 2,
    });
  }
  encoder.finish();
  return new Blob([new Uint8Array(encoder.bytes())], { type: 'image/gif' });
}

function renderContactSheet(atlas: ImageData, scale = 2, cellSize = 96): ImageData {
  const w = atlas.width * scale;
  const h = atlas.height * scale;
  const out = resizeNearest(atlas, w, h);
  const data = out.data;
  const cs = cellSize * scale;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x % cs === 0 || y % cs === 0) {
        const i = (y * w + x) * 4;
        // Only paint the grid where the atlas is transparent — never over character pixels.
        if (data[i + 3] === 0) {
          data[i] = 80;
          data[i + 1] = 80;
          data[i + 2] = 80;
          data[i + 3] = 200;
        }
      }
    }
  }
  return out;
}

export async function runSpriteworksJob(
  job: SpriteworksJob,
  onProgress: ProgressCallback = () => undefined,
): Promise<PipelineResult> {
  const { settings, rowMap } = job;
  const outAtlasW = settings.cellSize * settings.cols;
  const outAtlasH = settings.cellSize * settings.rows;
  const isCustomCharacter = job.isCustomCharacter === true;
  const tokenLabel = isCustomCharacter
    ? 'this character'
    : job.tokenId === 'custom'
      ? 'Custom BOOA'
      : `BOOA #${job.tokenId}`;

  // Wide single-row strips (8×1, 10×1) distort under image-AI models. For
  // single-animation outputs we generate in a square-ish gen grid and
  // rearrange the extracted frames into the requested strip after extraction.
  const totalFrames = rowMap.reduce((s, r) => s + r.frames, 0);
  const isSingleAnimation =
    rowMap.length === 1 && settings.rows === 1 && rowMap[0].frames >= 4;
  const genGrid = isSingleAnimation
    ? pickGenerationGrid(totalFrames)
    : { cols: settings.cols, rows: settings.rows };
  const genAtlasW = settings.cellSize * genGrid.cols;
  const genAtlasH = settings.cellSize * genGrid.rows;
  const rearrangeForGen = isSingleAnimation && (genGrid.cols !== settings.cols || genGrid.rows !== settings.rows);

  const extractRowMap: RowSpec[] = rearrangeForGen
    ? splitForGenGrid(rowMap[0], genGrid.cols, genGrid.rows)
    : rowMap;

  const hasLayoutReference = !!job.referenceDataUrl;
  const prompt = buildSpritePrompt({
    atlasWidth: genAtlasW,
    atlasHeight: genAtlasH,
    cellSize: settings.cellSize,
    cols: genGrid.cols,
    rows: genGrid.rows,
    tokenLabel,
    customLayoutDescription: job.customLayoutDescription,
    hasLayoutReference,
    rearrangedFrameCount: rearrangeForGen ? totalFrames : undefined,
    isCustomCharacter,
  });

  const layoutB64 = job.referenceDataUrl ? dataUrlToBase64(job.referenceDataUrl) : undefined;
  let avatarB64 = dataUrlToBase64(job.avatarDataUrl);
  let canonicalAvatarDataUrl = job.avatarDataUrl;

  // BOOA NFTs are bust-only; without extending to a full body the atlas pass
  // has to invent a body in every cell and ends up redrawing the face,
  // breaking identity. Extension is default-on.
  if (job.skipExtension !== true) {
    onProgress({ stage: 'extend-start', provider: job.provider });
    const extendPrompt = buildExtendPrompt();
    let extendedB64: string;
    if (job.provider === 'gemini') {
      extendedB64 = await generateExtendedBodyGemini({
        apiKey: job.apiKey,
        prompt: extendPrompt,
        bustBase64: avatarB64,
      });
    } else if (job.provider === 'openai') {
      extendedB64 = await generateExtendedBodyOpenAI({
        apiKey: job.apiKey,
        prompt: extendPrompt,
        bustBase64: avatarB64,
      });
    } else {
      throw new Error(`provider not yet supported: ${job.provider}`);
    }
    onProgress({ stage: 'extend-done', bytes: extendedB64.length });
    avatarB64 = extendedB64;
    canonicalAvatarDataUrl = base64ToDataUrl(extendedB64);
  }

  onProgress({
    stage: 'gen-start',
    provider: job.provider,
    genCols: genGrid.cols,
    genRows: genGrid.rows,
    outCols: settings.cols,
    outRows: settings.rows,
  });
  let atlasB64: string;
  if (job.provider === 'gemini') {
    atlasB64 = await generateSpriteAtlasGemini({
      apiKey: job.apiKey,
      prompt,
      referenceLayoutBase64: layoutB64,
      referenceAvatarBase64: avatarB64,
    });
  } else if (job.provider === 'openai') {
    atlasB64 = await generateSpriteAtlasOpenAI({
      apiKey: job.apiKey,
      prompt,
      referenceLayoutBase64: layoutB64,
      referenceAvatarBase64: avatarB64,
    });
  } else {
    throw new Error(`provider not yet supported: ${job.provider}`);
  }
  onProgress({ stage: 'gen-done', bytes: atlasB64.length });

  // Resize target is the gen geometry — that's what extraction will read from.
  let atlasImg = await dataUrlToImageData(base64ToDataUrl(atlasB64));
  if (atlasImg.width !== genAtlasW || atlasImg.height !== genAtlasH) {
    atlasImg = resizeNearest(atlasImg, genAtlasW, genAtlasH);
  }

  onProgress({ stage: 'pipeline-start' });
  const avatarImg = await dataUrlToImageData(canonicalAvatarDataUrl);
  const { processed: cleanAtlas, palette } = processImageData(atlasImg, {
    avatarImage: avatarImg,
    paletteMode: settings.paletteMode,
    chromaKey: settings.chromaKey,
    chromaTolerance: settings.chromaTolerance,
  });
  onProgress({ stage: 'pipeline-done', paletteSize: palette.length });

  onProgress({ stage: 'extract-start' });
  const framesByState = new Map<string, ImageData[]>();
  const methodUsedPerRow: Record<string, 'components' | 'slot'> = {};
  for (const row of extractRowMap) {
    if (row.frames <= 0) continue;
    const strip = cropImageData(cleanAtlas, 0, row.row * settings.cellSize, genAtlasW, settings.cellSize);
    let frames: ImageData[] | null = null;
    if (settings.cellMethod === 'auto' || settings.cellMethod === 'components') {
      frames = extractComponentFrames(strip, row.frames, settings.cellSize, settings.cellSize, settings.cellAnchor);
    }
    if (!frames) {
      frames = extractSlotFrames(strip, row.frames, settings.cellSize, settings.cellSize, settings.cellAnchor);
      methodUsedPerRow[row.state] = 'slot';
    } else if (!methodUsedPerRow[row.state]) {
      methodUsedPerRow[row.state] = 'components';
    }
    const bucket = framesByState.get(row.state) ?? [];
    bucket.push(...frames);
    framesByState.set(row.state, bucket);
  }

  const cells: { state: string; col: number; dataUrl: string }[] = [];
  const rebuilt = new ImageData(outAtlasW, outAtlasH);
  for (const row of rowMap) {
    if (row.frames <= 0) continue;
    const stateFrames = framesByState.get(row.state) ?? [];
    for (let col = 0; col < row.frames; col++) {
      const frame = stateFrames[col];
      if (!frame) continue;
      pasteImageData(rebuilt, frame, col * settings.cellSize, row.row * settings.cellSize);
      cells.push({ state: row.state, col, dataUrl: imageDataToDataUrl(frame) });
    }
  }

  // Tighter chroma tolerance — the rebuilt atlas is already cleaned per-cell.
  const { processed: finalAtlas } = processImageData(rebuilt, {
    avatarImage: avatarImg,
    paletteMode: settings.paletteMode,
    chromaKey: [0, 255, 0],
    chromaTolerance: 32,
  });
  const atlasDataUrl = imageDataToDataUrl(finalAtlas);
  onProgress({ stage: 'extract-done', frames: cells.length });

  onProgress({ stage: 'gifs-start' });
  const rowGifBlobs: { state: string; blob: Blob }[] = [];
  for (const row of rowMap) {
    if (row.frames <= 0) continue;
    const rowFrames: ImageData[] = [];
    for (let col = 0; col < row.frames; col++) {
      const c = cells.find((cc) => cc.state === row.state && cc.col === col);
      if (c) rowFrames.push(await dataUrlToImageData(c.dataUrl));
    }
    if (!rowFrames.length) continue;
    try {
      const blob = await renderGifFromFrames(rowFrames, row.durations_ms, settings.cellSize, settings.cellSize);
      rowGifBlobs.push({ state: row.state, blob });
    } catch (e) {
      console.error(`GIF render failed for ${row.state}:`, e);
      throw new Error(`GIF render failed for ${row.state}: ${e instanceof Error ? e.message : e}`);
    }
  }
  onProgress({ stage: 'gifs-done', count: rowGifBlobs.length });

  const contact = renderContactSheet(finalAtlas, 2, settings.cellSize);
  const contactSheetDataUrl = imageDataToDataUrl(contact);
  onProgress({ stage: 'contact-done' });

  const avatarPalette = extractPalette(avatarImg, 16);
  const overlap = paletteOverlap(finalAtlas, avatarPalette);
  onProgress({ stage: 'identity-done', overlap });

  return {
    atlasDataUrl,
    cells,
    rowGifBlobs,
    contactSheetDataUrl,
    paletteSize: palette.length,
    identityOverlap: overlap,
    methodUsedPerRow,
  };
}

export async function buildResultZip(
  result: PipelineResult,
  job: SpriteworksJob,
): Promise<Blob> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();

  const atlasBlob = await imageDataToBlob(await dataUrlToImageData(result.atlasDataUrl));
  zip.file('atlas.png', atlasBlob);

  const contactBlob = await imageDataToBlob(await dataUrlToImageData(result.contactSheetDataUrl));
  zip.file('contact-sheet.png', contactBlob);

  const cellsFolder = zip.folder('cells')!;
  for (const cell of result.cells) {
    const blob = await imageDataToBlob(await dataUrlToImageData(cell.dataUrl));
    cellsFolder.file(`${cell.state}_${cell.col.toString().padStart(2, '0')}.png`, blob);
  }

  const gifsFolder = zip.folder('gifs')!;
  for (const g of result.rowGifBlobs) {
    gifsFolder.file(`${g.state}.gif`, g.blob);
  }

  const manifest = {
    tokenId: job.tokenId,
    chainId: job.chainId,
    cellSize: job.settings.cellSize,
    cols: job.settings.cols,
    rows: job.settings.rows,
    atlasWidth: job.settings.cellSize * job.settings.cols,
    atlasHeight: job.settings.cellSize * job.settings.rows,
    rowMap: job.rowMap,
    paletteSize: result.paletteSize,
    identityOverlap: Math.round(result.identityOverlap * 1000) / 1000,
    methodUsedPerRow: result.methodUsedPerRow,
    provider: job.provider,
    createdAt: new Date().toISOString(),
  };
  zip.file('atlas.json', JSON.stringify(manifest, null, 2));

  return await zip.generateAsync({ type: 'blob' });
}

export type { PipelineResult, RowSpec };
export { ATLAS_COLS, ATLAS_ROWS, BOOA_C64_PALETTE };
