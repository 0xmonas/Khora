import { BOOA_C64_PALETTE, type RGB } from './types';

const ALPHA_GATE = 128;

function distSq(a: RGB, b: RGB): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

function nearest(rgb: RGB, palette: RGB[]): RGB {
  let best = palette[0];
  let bestD = distSq(rgb, best);
  for (let i = 1; i < palette.length; i++) {
    const d = distSq(rgb, palette[i]);
    if (d < bestD) {
      best = palette[i];
      bestD = d;
    }
  }
  return best;
}

export function isGreenish(rgb: RGB): boolean {
  const [r, g, b] = rgb;
  return g > r + 25 && g > b + 25 && g > 110;
}

export function chromaKey(image: ImageData, keyRgb: RGB = [0, 255, 0], tolerance = 96): ImageData {
  const out = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  const tolSq = tolerance * tolerance;
  const data = out.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    if (distSq([data[i], data[i + 1], data[i + 2]], keyRgb) <= tolSq) {
      data[i + 3] = 0;
    }
  }
  return out;
}

// Catches residual chroma-family pixels (anti-aliased halos) that the primary
// chromaKey leaves behind around character edges.
export function killGreenHalo(image: ImageData): ImageData {
  const out = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  const data = out.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    if (g >= 180 && r <= 110 && b <= 110 && g - Math.max(r, b) >= 60) {
      data[i + 3] = 0;
    }
  }
  return out;
}

export function extractPalette(image: ImageData, maxColors = 16, skipChromaFamily = true): RGB[] {
  const samples: RGB[] = [];
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < ALPHA_GATE) continue;
    const rgb: RGB = [data[i], data[i + 1], data[i + 2]];
    if (skipChromaFamily && isGreenish(rgb)) continue;
    samples.push(rgb);
  }
  if (samples.length === 0) return [];
  return medianCut(samples, Math.min(maxColors, samples.length));
}

function bucketBounds(bucket: RGB[]) {
  let minR = 255, maxR = 0, minG = 255, maxG = 0, minB = 255, maxB = 0;
  for (const p of bucket) {
    if (p[0] < minR) minR = p[0]; if (p[0] > maxR) maxR = p[0];
    if (p[1] < minG) minG = p[1]; if (p[1] > maxG) maxG = p[1];
    if (p[2] < minB) minB = p[2]; if (p[2] > maxB) maxB = p[2];
  }
  const rR = maxR - minR, rG = maxG - minG, rB = maxB - minB;
  const axis: 0 | 1 | 2 = rR >= rG && rR >= rB ? 0 : rG >= rB ? 1 : 2;
  return { range: Math.max(rR, rG, rB), axis };
}

function bucketAverage(bucket: RGB[]): RGB {
  let r = 0, g = 0, b = 0;
  for (const p of bucket) { r += p[0]; g += p[1]; b += p[2]; }
  return [
    Math.round(r / bucket.length),
    Math.round(g / bucket.length),
    Math.round(b / bucket.length),
  ];
}

function medianCut(pixels: RGB[], k: number): RGB[] {
  if (pixels.length === 0 || k < 1) return [];
  const buckets: RGB[][] = [[...pixels]];
  while (buckets.length < k) {
    let maxRange = -1;
    let maxIdx = -1;
    for (let i = 0; i < buckets.length; i++) {
      if (buckets[i].length < 2) continue;
      const { range } = bucketBounds(buckets[i]);
      if (range > maxRange) { maxRange = range; maxIdx = i; }
    }
    if (maxIdx < 0) break;
    const bucket = buckets[maxIdx];
    const { axis } = bucketBounds(bucket);
    bucket.sort((a, b) => a[axis] - b[axis]);
    const mid = Math.floor(bucket.length / 2);
    buckets.splice(maxIdx, 1, bucket.slice(0, mid), bucket.slice(mid));
  }
  return buckets.map(bucketAverage);
}

// When the avatar contains no green tones, drop greens from the C64 supplement
// so palette-snap can't pull non-green pixels toward the chroma family.
export function filterChromaFamilyFromSupplement(avatar: RGB[], supplement: RGB[]): RGB[] {
  const avatarHasGreen = avatar.some(isGreenish);
  if (avatarHasGreen) return supplement;
  return supplement.filter((c) => !isGreenish(c));
}

export function resolvePalette(
  mode: 'avatar+c64' | 'avatar' | 'c64',
  avatarImage: ImageData | null,
  avatarMaxColors = 16,
): RGB[] {
  if (mode === 'c64') return [...BOOA_C64_PALETTE];
  if (mode === 'avatar') {
    if (!avatarImage) throw new Error("palette mode 'avatar' requires avatar image");
    const pal = extractPalette(avatarImage, avatarMaxColors);
    if (pal.length === 0) throw new Error('avatar palette is empty');
    return pal;
  }
  if (!avatarImage) return [...BOOA_C64_PALETTE];
  const avatarPal = extractPalette(avatarImage, avatarMaxColors);
  const supplement = filterChromaFamilyFromSupplement(avatarPal, [...BOOA_C64_PALETTE]);
  return mergePalettes(avatarPal, supplement);
}

function mergePalettes(...palettes: RGB[][]): RGB[] {
  const seen = new Set<string>();
  const out: RGB[] = [];
  for (const pal of palettes) {
    for (const c of pal) {
      const k = `${c[0]},${c[1]},${c[2]}`;
      if (!seen.has(k)) { seen.add(k); out.push(c); }
    }
  }
  return out;
}

export function snapToPalette(image: ImageData, palette: RGB[]): ImageData {
  if (palette.length === 0) return image;
  const out = new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
  const data = out.data;
  const cache = new Map<number, RGB>();
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < ALPHA_GATE) {
      data[i + 3] = 0;
      continue;
    }
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = (r << 16) | (g << 8) | b;
    let target = cache.get(key);
    if (!target) {
      target = nearest([r, g, b], palette);
      cache.set(key, target);
    }
    data[i] = target[0];
    data[i + 1] = target[1];
    data[i + 2] = target[2];
    data[i + 3] = 255;
  }
  return out;
}

export interface ProcessOptions {
  chromaKey?: RGB;
  chromaTolerance?: number;
  paletteMode?: 'avatar+c64' | 'avatar' | 'c64';
  avatarImage?: ImageData | null;
}

export function processImageData(input: ImageData, opts: ProcessOptions = {}): { processed: ImageData; palette: RGB[] } {
  const palette = resolvePalette(opts.paletteMode || 'avatar+c64', opts.avatarImage || null);
  const keyed = chromaKey(input, opts.chromaKey || [0, 255, 0], opts.chromaTolerance || 96);
  const haloed = killGreenHalo(keyed);
  const snapped = snapToPalette(haloed, palette);
  return { processed: snapped, palette };
}
