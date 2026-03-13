import sharp from 'sharp';

/**
 * Server-side bitmap encoding for BOOA V2.
 * Uses sharp instead of canvas (no DOM dependency).
 * Applies Bayer 8x8 ordered dithering before C64 palette quantization.
 */

interface RGBColor { r: number; g: number; b: number }

const C64_PALETTE: RGBColor[] = [
  { r: 0x00, g: 0x00, b: 0x00 }, //  0: Black
  { r: 0x62, g: 0x62, b: 0x62 }, //  1: Dark Grey
  { r: 0x89, g: 0x89, b: 0x89 }, //  2: Grey
  { r: 0xAD, g: 0xAD, b: 0xAD }, //  3: Light Grey
  { r: 0xFF, g: 0xFF, b: 0xFF }, //  4: White
  { r: 0x9F, g: 0x4E, b: 0x44 }, //  5: Brown-Red
  { r: 0xCB, g: 0x7E, b: 0x75 }, //  6: Salmon
  { r: 0x6D, g: 0x54, b: 0x12 }, //  7: Dark Brown
  { r: 0xA1, g: 0x68, b: 0x3C }, //  8: Orange-Brown
  { r: 0xC9, g: 0xD4, b: 0x87 }, //  9: Lime
  { r: 0x9A, g: 0xE2, b: 0x9B }, // 10: Light Green
  { r: 0x5C, g: 0xAB, b: 0x5E }, // 11: Green
  { r: 0x6A, g: 0xBF, b: 0xC6 }, // 12: Cyan
  { r: 0x88, g: 0x7E, b: 0xCB }, // 13: Purple
  { r: 0x50, g: 0x45, b: 0x9B }, // 14: Dark Purple
  { r: 0xA0, g: 0x57, b: 0xA3 }, // 15: Magenta
];

const EXACT_LOOKUP = new Map<number, number>();
C64_PALETTE.forEach((c, i) => {
  EXACT_LOOKUP.set((c.r << 16) | (c.g << 8) | c.b, i);
});

function nearestPaletteIndex(r: number, g: number, b: number): number {
  const key = (r << 16) | (g << 8) | b;
  const exact = EXACT_LOOKUP.get(key);
  if (exact !== undefined) return exact;

  let bestDist = Infinity;
  let bestIdx = 0;
  for (let i = 0; i < 16; i++) {
    const c = C64_PALETTE[i];
    const dr = r - c.r;
    const dg = g - c.g;
    const db = b - c.b;
    const dist = dr * dr + dg * dg + db * db;
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }
  return bestIdx;
}

// ── Bayer 4x4 ordered dithering matrix ──
const BAYER_MATRIX_4X4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5],
];

// Dithering parameters (matching takeover project defaults)
const DITHERING_STRENGTH = 10; // 0-100 scale (takeover default: 10)
const CONTRAST = 100;          // 100 = neutral (takeover default)
const BRIGHTNESS = 100;        // 100 = neutral (takeover default)

/**
 * Apply Bayer 4x4 ordered dithering to raw pixel data.
 * Algorithm matches takeover-nextjs/src/lib/dt1/image-processor.ts BAYER_4X4 path.
 */
function applyBayer4x4Dither(data: Buffer, w: number, h: number, channels: number): void {
  const contrastFactor = CONTRAST / 100;
  const brightnessFactor = BRIGHTNESS / 100;
  const ditherStrength = DITHERING_STRENGTH / 100;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * channels;
      const bayerValue = BAYER_MATRIX_4X4[y % 4][x % 4] / 16;

      for (let c = 0; c < 3; c++) {
        let value = data[i + c] / 255;
        value = (value - 0.5) * contrastFactor + 0.5;
        value = value * brightnessFactor;
        value = value + (bayerValue - 0.5) * ditherStrength;
        data[i + c] = Math.max(0, Math.min(255, Math.round(value * 255)));
      }
    }
  }
}

const GRID_SIZE = 64;
const PREVIEW_SCALE = 16; // 64 * 16 = 1024

/**
 * Encode a base64 image into a 2,048-byte bitmap (server-side).
 *
 * @param base64Image - Base64 data URI (data:image/...;base64,...) or raw base64
 * @returns Uint8Array of exactly 2,048 bytes
 */
export async function encodeBitmapServer(base64Image: string): Promise<Uint8Array> {
  const raw = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
  const imageBuffer = Buffer.from(raw, 'base64');

  // Resize to 64x64 with nearest-neighbor (preserves pixel art)
  const { data } = await sharp(imageBuffer)
    .resize(GRID_SIZE, GRID_SIZE, { kernel: 'nearest' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Apply Bayer 8x8 dithering (replaces pixel stretch)
  const dithered = Buffer.from(data);
  applyBayer4x4Dither(dithered, GRID_SIZE, GRID_SIZE, 3);

  // Pack into 4-bit nibbles (C64 palette indices)
  const bytesPerRow = GRID_SIZE / 2;
  const bitmap = new Uint8Array(GRID_SIZE * bytesPerRow);

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x += 2) {
      const i0 = (y * GRID_SIZE + x) * 3;
      const i1 = (y * GRID_SIZE + x + 1) * 3;

      const idx0 = nearestPaletteIndex(dithered[i0], dithered[i0 + 1], dithered[i0 + 2]);
      const idx1 = nearestPaletteIndex(dithered[i1], dithered[i1 + 1], dithered[i1 + 2]);

      bitmap[y * bytesPerRow + (x >> 1)] = (idx0 << 4) | idx1;
    }
  }

  return bitmap;
}

/**
 * Pixelate an image to 64x64 with Bayer 4x4 dither + C64 palette quantization (server-side).
 * Returns base64 PNG for preview. Always produces square 64x64 output (for minting).
 */
export async function pixelateImageServer(base64Image: string): Promise<string> {
  const raw = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
  const imageBuffer = Buffer.from(raw, 'base64');

  // Downscale to 64x64
  const { data } = await sharp(imageBuffer)
    .resize(GRID_SIZE, GRID_SIZE, { kernel: 'nearest' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Apply Bayer 4x4 dithering
  const dithered = Buffer.from(data);
  applyBayer4x4Dither(dithered, GRID_SIZE, GRID_SIZE, 3);

  // Quantize to C64 palette
  const quantized = Buffer.alloc(GRID_SIZE * GRID_SIZE * 3);
  for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
    const idx = nearestPaletteIndex(dithered[i * 3], dithered[i * 3 + 1], dithered[i * 3 + 2]);
    const c = C64_PALETTE[idx];
    quantized[i * 3] = c.r;
    quantized[i * 3 + 1] = c.g;
    quantized[i * 3 + 2] = c.b;
  }

  // Scale up to 1024x1024 with nearest-neighbor
  const outputSize = GRID_SIZE * PREVIEW_SCALE;
  const png = await sharp(quantized, { raw: { width: GRID_SIZE, height: GRID_SIZE, channels: 3 } })
    .resize(outputSize, outputSize, { kernel: 'nearest' })
    .png()
    .toBuffer();

  return `data:image/png;base64,${png.toString('base64')}`;
}

// ── Aspect ratio support for Img2Booa ──

const SUPPORTED_RATIOS: [number, number][] = [
  [1, 1], [2, 3], [3, 2], [3, 4], [4, 3], [16, 9], [9, 16], [2, 1], [1, 2],
];

function snapToRatio(w: number, h: number): [number, number] {
  const aspect = w / h;
  let best: [number, number] = [1, 1];
  let bestDiff = Infinity;
  for (const [rw, rh] of SUPPORTED_RATIOS) {
    const diff = Math.abs(aspect - rw / rh);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = [rw, rh];
    }
  }
  return best;
}

function gridDimensions(rw: number, rh: number): { gw: number; gh: number } {
  // Base unit = 64. Scale so the longer side is 64.
  if (rw >= rh) {
    const gw = GRID_SIZE;
    const gh = Math.round((GRID_SIZE * rh) / rw);
    return { gw, gh: gh % 2 === 0 ? gh : gh + 1 }; // keep even for nibble packing
  }
  const gh = GRID_SIZE;
  const gw = Math.round((GRID_SIZE * rw) / rh);
  return { gw: gw % 2 === 0 ? gw : gw + 1, gh };
}

export interface PixelateResult {
  image: string;
  width: number;
  height: number;
  ratio: [number, number];
}

/**
 * Pixelate an image preserving its aspect ratio.
 * Snaps to the nearest supported ratio, then produces a proportional pixel grid.
 */
export async function pixelateImageWithAspect(base64Image: string): Promise<PixelateResult> {
  const raw = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
  const imageBuffer = Buffer.from(raw, 'base64');

  // Auto-rotate based on EXIF orientation, then read true dimensions
  const rotatedBuf = await sharp(imageBuffer).rotate().toBuffer();
  const meta = await sharp(rotatedBuf).metadata();
  const srcW = meta.width ?? 64;
  const srcH = meta.height ?? 64;

  const ratio = snapToRatio(srcW, srcH);
  const { gw, gh } = gridDimensions(ratio[0], ratio[1]);

  const { data } = await sharp(rotatedBuf)
    .resize(gw, gh, { kernel: 'nearest' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const dithered = Buffer.from(data);
  applyBayer4x4Dither(dithered, gw, gh, 3);

  const totalPixels = gw * gh;
  const quantized = Buffer.alloc(totalPixels * 3);
  for (let i = 0; i < totalPixels; i++) {
    const idx = nearestPaletteIndex(dithered[i * 3], dithered[i * 3 + 1], dithered[i * 3 + 2]);
    const c = C64_PALETTE[idx];
    quantized[i * 3] = c.r;
    quantized[i * 3 + 1] = c.g;
    quantized[i * 3 + 2] = c.b;
  }

  const outW = gw * PREVIEW_SCALE;
  const outH = gh * PREVIEW_SCALE;
  const png = await sharp(quantized, { raw: { width: gw, height: gh, channels: 3 } })
    .resize(outW, outH, { kernel: 'nearest' })
    .png()
    .toBuffer();

  return {
    image: `data:image/png;base64,${png.toString('base64')}`,
    width: outW,
    height: outH,
    ratio,
  };
}
