// Sprite Shop orchestrator — runs the full pipeline end-to-end in the browser.
//
//   1. AI generation (provider chosen by user)
//   2. Resize-nearest to atlas geometry if needed
//   3. Pipeline: chroma key + halo kill + palette snap (avatar-aware)
//   4. Per-row component extraction + fit_to_cell (slot fallback)
//   5. Rebuild atlas + final palette snap
//   6. Per-row GIFs + contact sheet
//   7. Identity overlap check

import {
  ATLAS_COLS,
  ATLAS_ROWS,
  type PipelineResult,
  type RGB,
  type RowSpec,
  type SpriteShopJob,
  BOOA_C64_PALETTE,
} from './types';
import {
  processImageData,
  resolvePalette,
} from './pipeline';
import {
  cropImageData,
  extractComponentFrames,
  extractSlotFrames,
  imageDataToBlob,
  imageDataToDataUrl,
  pasteImageData,
  resizeNearest,
} from './extract';
import { buildSpritePrompt } from './prompt';
import { generateSpriteAtlasGemini } from './gemini';
import { generateSpriteAtlasOpenAI } from './openai';

// gif.js global type — loaded as a script when needed.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  interface Window { GIF?: any }
}

export type ProgressEvent =
  | { stage: 'gen-start'; provider: string }
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

// ── Helper: dataURL ↔ ImageData ───────────────────────────────────────

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

// ── Identity overlap check ─────────────────────────────────────────────

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

// ── GIF rendering via gif.js (lazy-loaded) ────────────────────────────

async function ensureGifJsLoaded(): Promise<void> {
  if (typeof window !== 'undefined' && window.GIF) return;
  await new Promise<void>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://unpkg.com/gif.js@0.2.0/dist/gif.js';
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('gif.js load failed'));
    document.head.appendChild(s);
  });
}

async function renderGifFromFrames(
  frames: ImageData[],
  durations: number[],
  cellW: number,
  cellH: number,
): Promise<Blob> {
  await ensureGifJsLoaded();
  return new Promise<Blob>((resolve, reject) => {
    // gif.js uses a worker — point it at the unpkg copy.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const GIF: any = (window as any).GIF;
    const gif = new GIF({
      workers: 2,
      quality: 1,
      width: cellW,
      height: cellH,
      transparent: 0x00ff00,
      workerScript: 'https://unpkg.com/gif.js@0.2.0/dist/gif.worker.js',
    });
    gif.on('finished', (blob: Blob) => resolve(blob));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gif.on('error', (err: any) => reject(err));
    for (let i = 0; i < frames.length; i++) {
      const c = document.createElement('canvas');
      c.width = cellW;
      c.height = cellH;
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      // Composite green background so transparent areas become transparent in GIF
      ctx.fillStyle = '#00FF00';
      ctx.fillRect(0, 0, cellW, cellH);
      ctx.putImageData(frames[i], 0, 0);
      gif.addFrame(c, { delay: durations[i] || 120 });
    }
    gif.render();
  });
}

// ── Contact sheet (2× zoom + grid overlay) ────────────────────────────

function renderContactSheet(atlas: ImageData, scale = 2, cellSize = 96): ImageData {
  const w = atlas.width * scale;
  const h = atlas.height * scale;
  const out = resizeNearest(atlas, w, h);
  // Grid overlay
  const data = out.data;
  const cs = cellSize * scale;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (x % cs === 0 || y % cs === 0) {
        const i = (y * w + x) * 4;
        // Don't overwrite character pixels — only blend on transparent areas
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

// ── Main entry point ──────────────────────────────────────────────────

export async function runSpriteShopJob(
  job: SpriteShopJob,
  onProgress: ProgressCallback = () => undefined,
): Promise<PipelineResult> {
  const { settings, rowMap } = job;
  const atlasW = settings.cellSize * settings.cols;
  const atlasH = settings.cellSize * settings.rows;
  const tokenLabel = job.tokenId === 'custom' ? 'Custom BOOA' : `BOOA #${job.tokenId}`;

  const prompt = buildSpritePrompt({
    atlasWidth: atlasW,
    atlasHeight: atlasH,
    cellSize: settings.cellSize,
    tokenLabel,
  });

  const layoutB64 = dataUrlToBase64(job.referenceDataUrl);
  const avatarB64 = dataUrlToBase64(job.avatarDataUrl);

  // 1. Generation
  onProgress({ stage: 'gen-start', provider: job.provider });
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

  // 2. Decode + resize-nearest if AI returned wrong dim
  let atlasImg = await dataUrlToImageData(base64ToDataUrl(atlasB64));
  if (atlasImg.width !== atlasW || atlasImg.height !== atlasH) {
    atlasImg = resizeNearest(atlasImg, atlasW, atlasH);
  }

  // 3. Pipeline
  onProgress({ stage: 'pipeline-start' });
  const avatarImg = await dataUrlToImageData(job.avatarDataUrl);
  const { processed: cleanAtlas, palette } = processImageData(atlasImg, {
    avatarImage: avatarImg,
    paletteMode: settings.paletteMode,
    chromaKey: settings.chromaKey,
    chromaTolerance: settings.chromaTolerance,
  });
  onProgress({ stage: 'pipeline-done', paletteSize: palette.length });

  // 4. Per-row extraction
  onProgress({ stage: 'extract-start' });
  const cells: { state: string; col: number; dataUrl: string }[] = [];
  const methodUsedPerRow: Record<string, 'components' | 'slot'> = {};
  const rebuilt = new ImageData(atlasW, atlasH);
  for (const row of rowMap) {
    if (row.frames <= 0) continue;
    const strip = cropImageData(cleanAtlas, 0, row.row * settings.cellSize, atlasW, settings.cellSize);
    let frames: ImageData[] | null = null;
    if (settings.cellMethod === 'auto' || settings.cellMethod === 'components') {
      frames = extractComponentFrames(strip, row.frames, settings.cellSize, settings.cellSize, settings.cellAnchor);
    }
    if (!frames) {
      frames = extractSlotFrames(strip, row.frames, settings.cellSize, settings.cellSize, settings.cellAnchor);
      methodUsedPerRow[row.state] = 'slot';
    } else {
      methodUsedPerRow[row.state] = 'components';
    }
    frames.forEach((frame, col) => {
      pasteImageData(rebuilt, frame, col * settings.cellSize, row.row * settings.cellSize);
      cells.push({ state: row.state, col, dataUrl: imageDataToDataUrl(frame) });
    });
  }

  // 5. Final palette snap on rebuilt atlas
  const { processed: finalAtlas } = processImageData(rebuilt, {
    avatarImage: avatarImg,
    paletteMode: settings.paletteMode,
    chromaKey: [0, 255, 0],
    chromaTolerance: 32, // tighter — rebuilt should already be clean
  });
  const atlasDataUrl = imageDataToDataUrl(finalAtlas);
  onProgress({ stage: 'extract-done', frames: cells.length });

  // 6. Per-row GIFs
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
      // GIF rendering failures are non-fatal — keep going.
      console.warn(`GIF render failed for ${row.state}:`, e);
    }
  }
  onProgress({ stage: 'gifs-done', count: rowGifBlobs.length });

  // 7. Contact sheet
  const contact = renderContactSheet(finalAtlas, 2, settings.cellSize);
  const contactSheetDataUrl = imageDataToDataUrl(contact);
  onProgress({ stage: 'contact-done' });

  // 8. Identity overlap (against the avatar's palette)
  const avatarPalette = resolvePalette(settings.paletteMode, avatarImg);
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

// ── Convenience: bundle outputs as a ZIP for download ─────────────────

export async function buildResultZip(
  result: PipelineResult,
  job: SpriteShopJob,
): Promise<Blob> {
  // Lazy import to keep page bundle small.
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
    cols: ATLAS_COLS,
    rows: ATLAS_ROWS,
    atlasWidth: job.settings.cellSize * ATLAS_COLS,
    atlasHeight: job.settings.cellSize * ATLAS_ROWS,
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

// Re-export for convenience
export type { PipelineResult, RowSpec };
export { ATLAS_COLS, ATLAS_ROWS, BOOA_C64_PALETTE };
