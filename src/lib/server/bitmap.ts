import sharp from 'sharp';

/**
 * Server-side bitmap encoding for BOOA V2.
 * Uses sharp instead of canvas (no DOM dependency).
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

const GRID_SIZE = 64;

/**
 * Encode a base64 image into a 2,048-byte bitmap (server-side).
 *
 * @param base64Image - Base64 data URI (data:image/...;base64,...) or raw base64
 * @returns Uint8Array of exactly 2,048 bytes
 */
export async function encodeBitmapServer(base64Image: string): Promise<Uint8Array> {
  // Strip data URI prefix if present
  const raw = base64Image.includes(',') ? base64Image.split(',')[1] : base64Image;
  const imageBuffer = Buffer.from(raw, 'base64');

  // Resize to 64x64 with nearest-neighbor (preserves pixel art)
  const { data } = await sharp(imageBuffer)
    .resize(GRID_SIZE, GRID_SIZE, { kernel: 'nearest' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Pack into 4-bit nibbles
  const bytesPerRow = GRID_SIZE / 2;
  const bitmap = new Uint8Array(GRID_SIZE * bytesPerRow);

  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x += 2) {
      const i0 = (y * GRID_SIZE + x) * 3;
      const i1 = (y * GRID_SIZE + x + 1) * 3;

      const idx0 = nearestPaletteIndex(data[i0], data[i0 + 1], data[i0 + 2]);
      const idx1 = nearestPaletteIndex(data[i1], data[i1 + 1], data[i1 + 2]);

      bitmap[y * bytesPerRow + (x >> 1)] = (idx0 << 4) | idx1;
    }
  }

  return bitmap;
}

/**
 * Pixelate an image to 64x64 with C64 palette quantization (server-side).
 * Returns base64 PNG for preview.
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

  // Quantize to C64 palette
  const quantized = Buffer.alloc(GRID_SIZE * GRID_SIZE * 3);
  for (let i = 0; i < GRID_SIZE * GRID_SIZE; i++) {
    const idx = nearestPaletteIndex(data[i * 3], data[i * 3 + 1], data[i * 3 + 2]);
    const c = C64_PALETTE[idx];
    quantized[i * 3] = c.r;
    quantized[i * 3 + 1] = c.g;
    quantized[i * 3 + 2] = c.b;
  }

  // Scale up to 512x512 for preview
  const png = await sharp(quantized, { raw: { width: GRID_SIZE, height: GRID_SIZE, channels: 3 } })
    .resize(512, 512, { kernel: 'nearest' })
    .png()
    .toBuffer();

  return `data:image/png;base64,${png.toString('base64')}`;
}
