const ALPHA_MIN = 16;

interface Component {
  pixels: number[];
  // bbox max coordinates are exclusive: [minX, minY, maxX, maxY) — width = maxX - minX.
  bbox: [number, number, number, number];
  area: number;
  centerX: number;
  centerY: number;
}

export function imageDataFromImage(img: HTMLImageElement | HTMLCanvasElement): ImageData {
  const canvas = document.createElement('canvas');
  canvas.width = (img instanceof HTMLImageElement) ? img.naturalWidth : img.width;
  canvas.height = (img instanceof HTMLImageElement) ? img.naturalHeight : img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

export function imageDataToBlob(image: ImageData, type = 'image/png'): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(image, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob failed')), type);
  });
}

export function imageDataToDataUrl(image: ImageData, type = 'image/png'): string {
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL(type);
}

export function cropImageData(src: ImageData, x: number, y: number, w: number, h: number): ImageData {
  const out = new ImageData(w, h);
  const dst = out.data;
  const s = src.data;
  for (let row = 0; row < h; row++) {
    const srcStart = ((y + row) * src.width + x) * 4;
    const dstStart = row * w * 4;
    dst.set(s.subarray(srcStart, srcStart + w * 4), dstStart);
  }
  return out;
}

export function pasteImageData(target: ImageData, src: ImageData, dx: number, dy: number): void {
  const t = target.data;
  const s = src.data;
  for (let row = 0; row < src.height; row++) {
    const ty = dy + row;
    if (ty < 0 || ty >= target.height) continue;
    for (let col = 0; col < src.width; col++) {
      const tx = dx + col;
      if (tx < 0 || tx >= target.width) continue;
      const sIdx = (row * src.width + col) * 4;
      if (s[sIdx + 3] === 0) continue;
      const tIdx = (ty * target.width + tx) * 4;
      const sa = s[sIdx + 3] / 255;
      const ta = t[tIdx + 3] / 255;
      const oa = sa + ta * (1 - sa);
      if (oa === 0) continue;
      t[tIdx]     = Math.round((s[sIdx]     * sa + t[tIdx]     * ta * (1 - sa)) / oa);
      t[tIdx + 1] = Math.round((s[sIdx + 1] * sa + t[tIdx + 1] * ta * (1 - sa)) / oa);
      t[tIdx + 2] = Math.round((s[sIdx + 2] * sa + t[tIdx + 2] * ta * (1 - sa)) / oa);
      t[tIdx + 3] = Math.round(oa * 255);
    }
  }
}

export function getBBox(image: ImageData): [number, number, number, number] | null {
  const w = image.width, h = image.height;
  const d = image.data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] >= ALPHA_MIN) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) return null;
  return [minX, minY, maxX + 1, maxY + 1];
}

export function resizeNearest(src: ImageData, dstW: number, dstH: number): ImageData {
  const out = new ImageData(dstW, dstH);
  const sw = src.width, sh = src.height;
  const sd = src.data, dd = out.data;
  for (let y = 0; y < dstH; y++) {
    const sy = Math.min(sh - 1, Math.floor((y * sh) / dstH));
    for (let x = 0; x < dstW; x++) {
      const sx = Math.min(sw - 1, Math.floor((x * sw) / dstW));
      const sIdx = (sy * sw + sx) * 4;
      const dIdx = (y * dstW + x) * 4;
      dd[dIdx]     = sd[sIdx];
      dd[dIdx + 1] = sd[sIdx + 1];
      dd[dIdx + 2] = sd[sIdx + 2];
      dd[dIdx + 3] = sd[sIdx + 3];
    }
  }
  return out;
}

function connectedComponents(image: ImageData): Component[] {
  const w = image.width, h = image.height;
  const data = image.data;
  const visited = new Uint8Array(w * h);
  const components: Component[] = [];

  for (let start = 0; start < w * h; start++) {
    if (visited[start]) continue;
    const aIdx = start * 4 + 3;
    if (data[aIdx] <= ALPHA_MIN) continue;

    const stack: number[] = [start];
    visited[start] = 1;
    const pixels: number[] = [];
    let minX = w, minY = h, maxX = 0, maxY = 0;

    while (stack.length) {
      const current = stack.pop()!;
      pixels.push(current);
      const x = current % w;
      const y = Math.floor(current / w);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;

      if (x > 0) {
        const n = current - 1;
        if (!visited[n] && data[n * 4 + 3] > ALPHA_MIN) { visited[n] = 1; stack.push(n); }
      }
      if (x + 1 < w) {
        const n = current + 1;
        if (!visited[n] && data[n * 4 + 3] > ALPHA_MIN) { visited[n] = 1; stack.push(n); }
      }
      if (y > 0) {
        const n = current - w;
        if (!visited[n] && data[n * 4 + 3] > ALPHA_MIN) { visited[n] = 1; stack.push(n); }
      }
      if (y + 1 < h) {
        const n = current + w;
        if (!visited[n] && data[n * 4 + 3] > ALPHA_MIN) { visited[n] = 1; stack.push(n); }
      }
    }

    components.push({
      pixels,
      area: pixels.length,
      bbox: [minX, minY, maxX + 1, maxY + 1],
      centerX: (minX + maxX + 1) / 2,
      centerY: (minY + maxY + 1) / 2,
    });
  }
  return components;
}

// Drops thin components hugging the row's top/bottom edge — these are usually
// stray pixels from neighboring rows that bled through chroma keying, not real
// frame content.
function isRowEdgeSpillover(c: Component, stripHeight: number, edgeBandPct = 0.15): boolean {
  const [, by0, , by1] = c.bbox;
  const h = by1 - by0;
  const cy = (by0 + by1) / 2;
  const band = stripHeight * edgeBandPct;
  const nearTop = cy <= band;
  const nearBottom = cy >= stripHeight - band;
  const isThin = h <= stripHeight * 0.30;
  return (nearTop || nearBottom) && isThin;
}

function componentGroupImage(source: ImageData, group: Component[], padding = 4): ImageData {
  const w = source.width, h = source.height;
  const minX = Math.max(0, Math.min(...group.map((c) => c.bbox[0])) - padding);
  const minY = Math.max(0, Math.min(...group.map((c) => c.bbox[1])) - padding);
  const maxX = Math.min(w, Math.max(...group.map((c) => c.bbox[2])) + padding);
  const maxY = Math.min(h, Math.max(...group.map((c) => c.bbox[3])) + padding);

  const ow = maxX - minX;
  const oh = maxY - minY;
  const out = new ImageData(ow, oh);
  const od = out.data;
  const sd = source.data;
  for (const c of group) {
    for (const idx of c.pixels) {
      const x = idx % w;
      const y = Math.floor(idx / w);
      const oIdx = ((y - minY) * ow + (x - minX)) * 4;
      const sIdx = idx * 4;
      od[oIdx]     = sd[sIdx];
      od[oIdx + 1] = sd[sIdx + 1];
      od[oIdx + 2] = sd[sIdx + 2];
      od[oIdx + 3] = sd[sIdx + 3];
    }
  }
  return out;
}

export function fitToCell(
  image: ImageData,
  cellW: number,
  cellH: number,
  padding = 10,
  anchor: 'bottom' | 'center' = 'bottom',
): ImageData {
  const target = new ImageData(cellW, cellH);
  const bbox = getBBox(image);
  if (!bbox) return target;

  const [bx0, by0, bx1, by1] = bbox;
  const cropped = cropImageData(image, bx0, by0, bx1 - bx0, by1 - by0);

  const maxW = cellW - padding;
  const maxH = cellH - padding;
  // Never upscale above source — keeps pixel art sharp.
  const scale = Math.min(maxW / cropped.width, maxH / cropped.height, 1.0);
  let sized = cropped;
  if (scale !== 1.0) {
    const newW = Math.max(1, Math.round(cropped.width * scale));
    const newH = Math.max(1, Math.round(cropped.height * scale));
    sized = resizeNearest(cropped, newW, newH);
  }

  const left = Math.floor((cellW - sized.width) / 2);
  const top = anchor === 'bottom'
    ? cellH - sized.height - Math.floor(padding / 2)
    : Math.floor((cellH - sized.height) / 2);
  pasteImageData(target, sized, left, Math.max(0, top));
  return target;
}

export function extractComponentFrames(
  strip: ImageData,
  frameCount: number,
  cellW: number,
  cellH: number,
  anchor: 'bottom' | 'center' = 'bottom',
): ImageData[] | null {
  const raw = connectedComponents(strip);
  if (!raw.length) return null;

  const stripH = strip.height;
  const filtered = raw.filter((c) => !isRowEdgeSpillover(c, stripH));
  if (!filtered.length) return null;

  const largestArea = Math.max(...filtered.map((c) => c.area));
  const seedThreshold = Math.max(120, largestArea * 0.20);
  let seeds = filtered.filter((c) => c.area >= seedThreshold);
  if (seeds.length < frameCount) {
    seeds = [...filtered].sort((a, b) => b.area - a.area).slice(0, frameCount);
  }
  if (seeds.length < frameCount) return null;

  seeds = [...seeds].sort((a, b) => b.area - a.area).slice(0, frameCount).sort((a, b) => a.centerX - b.centerX);
  const seedSet = new Set(seeds);
  const groups: Component[][] = seeds.map((s) => [s]);
  const noiseThreshold = Math.max(12, largestArea * 0.002);

  for (const c of filtered) {
    if (seedSet.has(c) || c.area < noiseThreshold) continue;
    let nearest = 0;
    let nearestDist = Math.abs(seeds[0].centerX - c.centerX);
    for (let i = 1; i < seeds.length; i++) {
      const d = Math.abs(seeds[i].centerX - c.centerX);
      if (d < nearestDist) { nearest = i; nearestDist = d; }
    }
    groups[nearest].push(c);
  }

  return groups.map((g) => fitToCell(componentGroupImage(strip, g), cellW, cellH, 10, anchor));
}

export function extractSlotFrames(
  strip: ImageData,
  frameCount: number,
  cellW: number,
  cellH: number,
  anchor: 'bottom' | 'center' = 'bottom',
): ImageData[] {
  const slotW = strip.width / frameCount;
  const out: ImageData[] = [];
  for (let i = 0; i < frameCount; i++) {
    const left = Math.round(i * slotW);
    const right = Math.round((i + 1) * slotW);
    const crop = cropImageData(strip, left, 0, right - left, strip.height);
    out.push(fitToCell(crop, cellW, cellH, 10, anchor));
  }
  return out;
}
