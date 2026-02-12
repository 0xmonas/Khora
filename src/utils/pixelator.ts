interface RGBColor {
  r: number;
  g: number;
  b: number;
}

// C64 16-color palette
const PALETTE: RGBColor[] = [
  { r: 0x00, g: 0x00, b: 0x00 }, // #000000
  { r: 0x62, g: 0x62, b: 0x62 }, // #626262
  { r: 0x89, g: 0x89, b: 0x89 }, // #898989
  { r: 0xAD, g: 0xAD, b: 0xAD }, // #ADADAD
  { r: 0xFF, g: 0xFF, b: 0xFF }, // #FFFFFF
  { r: 0x9F, g: 0x4E, b: 0x44 }, // #9F4E44
  { r: 0xCB, g: 0x7E, b: 0x75 }, // #CB7E75
  { r: 0x6D, g: 0x54, b: 0x12 }, // #6D5412
  { r: 0xA1, g: 0x68, b: 0x3C }, // #A1683C
  { r: 0xC9, g: 0xD4, b: 0x87 }, // #C9D487
  { r: 0x9A, g: 0xE2, b: 0x9B }, // #9AE29B
  { r: 0x5C, g: 0xAB, b: 0x5E }, // #5CAB5E
  { r: 0x6A, g: 0xBF, b: 0xC6 }, // #6ABFC6
  { r: 0x88, g: 0x7E, b: 0xCB }, // #887ECB
  { r: 0x50, g: 0x45, b: 0x9B }, // #50459B
  { r: 0xA0, g: 0x57, b: 0xA3 }, // #A057A3
];

const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image.'));
    try {
      img.src = url;
    } catch {
      reject(new Error('Invalid image URL or format.'));
    }
  });
};

// 4x4 Bayer ordered dithering matrix
const BAYER_4X4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5]
];

const DITHER_STRENGTH = 0.5;

const applyBayerDither = (imageData: ImageData): ImageData => {
  const data = imageData.data;
  const w = imageData.width;

  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const bayerNorm = BAYER_4X4[y % 4][x % 4] / 16;

      for (let c = 0; c < 3; c++) {
        let v = data[i + c] / 255;
        v = v + (bayerNorm - 0.5) * DITHER_STRENGTH;
        data[i + c] = Math.max(0, Math.min(255, Math.round(v * 255)));
      }
    }
  }

  return imageData;
};

/** Find nearest palette color by Euclidean distance */
const quantizeToPalette = (imageData: ImageData): ImageData => {
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    let bestDist = Infinity;
    let best = PALETTE[0];

    for (const color of PALETTE) {
      const dr = r - color.r, dg = g - color.g, db = b - color.b;
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        best = color;
      }
    }

    data[i] = best.r;
    data[i + 1] = best.g;
    data[i + 2] = best.b;
    data[i + 3] = 255;
  }

  return imageData;
};

export const pixelateImage = async (imageUrl: string): Promise<string> => {
  const img = await loadImage(imageUrl);

  const size = 64;
  const scale = 16; // 64 * 16 = 1024

  // Downscale to 64x64
  const small = document.createElement('canvas');
  const sCtx = small.getContext('2d')!;
  small.width = size;
  small.height = size;
  sCtx.imageSmoothingEnabled = false;
  sCtx.drawImage(img, 0, 0, size, size);

  // Bayer dither (disabled)
  // const dithered = applyBayerDither(sCtx.getImageData(0, 0, size, size));
  // sCtx.putImageData(dithered, 0, 0);

  const quantized = quantizeToPalette(sCtx.getImageData(0, 0, size, size));
  sCtx.putImageData(quantized, 0, 0);

  // Scale up to 1024x1024 with nearest-neighbor
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = size * scale;
  canvas.height = size * scale;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(small, 0, 0, canvas.width, canvas.height);

  return canvas.toDataURL('image/png');
};
