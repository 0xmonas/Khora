interface RGBColor {
  r: number;
  g: number;
  b: number;
}

// Fixed two-tone palette: #F5F5F5 + #0A0A0A
const COLOR_WHITE: RGBColor = { r: 245, g: 245, b: 245 }; // #F5F5F5
const COLOR_BLACK: RGBColor = { r: 10, g: 10, b: 10 }; // #0A0A0A

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

// 4x4 Bayer ordered dithering matrix (take-over default)
const BAYER_4X4 = [
  [ 0,  8,  2, 10],
  [12,  4, 14,  6],
  [ 3, 11,  1,  9],
  [15,  7, 13,  5]
];

const DITHER_STRENGTH = 0.5; // take-over default: full strength

const applyBayerDither = (imageData: ImageData): ImageData => {
  const data = imageData.data;
  const w = imageData.width;

  for (let y = 0; y < imageData.height; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const bayerNorm = BAYER_4X4[y % 4][x % 4] / 16; // 0..0.9375

      for (let c = 0; c < 3; c++) {
        let v = data[i + c] / 255;
        // No contrast/brightness boost (take-over neutral defaults)
        v = v + (bayerNorm - 0.5) * DITHER_STRENGTH;
        data[i + c] = Math.max(0, Math.min(255, Math.round(v * 255)));
      }
    }
  }

  return imageData;
};

const quantizeToTwoTone = (imageData: ImageData): ImageData => {
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    // Threshold at 128 (take-over default)
    const chosen = data[i] < 128 ? COLOR_BLACK : COLOR_WHITE;

    data[i] = chosen.r;
    data[i + 1] = chosen.g;
    data[i + 2] = chosen.b;
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

  // Apply Bayer dither then quantize to two-tone
  const dithered = applyBayerDither(sCtx.getImageData(0, 0, size, size));
  sCtx.putImageData(dithered, 0, 0);

  const quantized = quantizeToTwoTone(sCtx.getImageData(0, 0, size, size));
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
