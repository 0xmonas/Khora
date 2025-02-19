interface Color {
  r: number;
  g: number;
  b: number;
}

const hexToRgb = (hex: string) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
};

type RGBColor = {
  r: number;
  g: number;
  b: number;
};

type ColorPalette = {
  color1?: RGBColor;
  color2?: RGBColor;
  colors?: RGBColor[];
};

const ColorPalettes: Record<PaletteType, ColorPalette> = {
  DEFAULT: {
    color1: { r: 51, g: 0, b: 255 },    // #3300ff
    color2: { r: 242, g: 242, b: 242 }  // #f2f2f2
  },
  MONOCHROME: {
    color1: { r: 54, g: 54, b: 54 },    // #171219
    color2: { r: 236, g: 236, b: 236 }  // #ffffff
  },
  EXPERIMENTAL: {
    color1: { r: 0, g: 0, b: 0 },     // Temporary values, to be calculated from image
    color2: { r: 255, g: 255, b: 255 }
  },
  MIDWEST: {
    colors: [
      '#e7cfab', '#b9ba7e', '#8e9359', '#646641', '#7f8fa6',
      '#ccdcf5', '#fcfcfa', '#73abd8', '#cc403e', '#1d1610',
      '#573d27', '#b27f5a',
      '#eca73b', '#fcd856', '#966a64', '#4d8eca', '#c0c7d3',
      '#fbe9c3', '#fca95a', '#444b4e', '#e0785c', '#bd9d86',
      '#32291f', '#f6db91', '#e4ceb3'
    ].map(hexToRgb)
  },
  SECAM: {
    colors: [
      '#000000', // Black
      '#2121ff', // Blue
      '#f03c79', // Red
      '#ff50ff', // Magenta
      '#7fff00', // Green
      '#7fffff', // Cyan
      '#ffff3f', // Yellow
      '#ffffff'  // White
    ].map(hexToRgb)
  },
  C64: {
    colors: [
      '#000000', // Black
      '#626262', // Dark Gray
      '#898989', // Gray
      '#adadad', // Light Gray
      '#ffffff', // White
      '#9f4e44', // Red
      '#cb7e75', // Light Red
      '#6d5412', // Brown
      '#a1683c', // Light Brown
      '#c9d487', // Light Green
      '#9ae29b', // Green
      '#5cab5e', // Dark Green
      '#6abfc6', // Cyan
      '#887ecb', // Light Blue
      '#50459b', // Blue
      '#a057a3'  // Purple
    ].map(hexToRgb)
  }
} as const;

type PaletteType = 'DEFAULT' | 'MONOCHROME' | 'EXPERIMENTAL' | 'MIDWEST' | 'SECAM' | 'C64';

const loadImage = (url: string): Promise<HTMLImageElement> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      console.log('✅ Image loaded successfully');
      resolve(img);
    };

    img.onerror = () => {
      console.error('❌ Failed to load image');
      reject(new Error('Failed to load image. Please check if the image format is supported.'));
    };

    try {
      img.src = url;
    } catch (error) {
      console.error('❌ Invalid image URL:', error);
      reject(new Error('Invalid image URL or format. Please try with a different image.'));
    }
  });
};

const colorDistance = (color1: RGBColor, color2: RGBColor): number => {
  const rDiff = color1.r - color2.r;
  const gDiff = color1.g - color2.g;
  const bDiff = color1.b - color2.b;
  return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
};

export const pixelateImage = async (
  imageUrl: string,
  selectedPalette: 'DEFAULT' | 'MONOCHROME' | 'EXPERIMENTAL' | 'MIDWEST' | 'SECAM' | 'C64' = 'DEFAULT'
): Promise<string> => {
  console.log('🚀 Starting... Selected palette:', selectedPalette);
  let manualThreshold = 127;

  const findOptimalThreshold = (imageData: ImageData): number => {
    console.log('🔍 Calculating optimal threshold...');
    const pixels: number[] = [];
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const brightness = r * 0.299 + g * 0.48 + b * 0.114;
      pixels.push(brightness);
    }
    
    const histogram = new Array(256).fill(0);
    pixels.forEach(p => histogram[Math.round(p)]++);
    
    let totalSum = 0;
    for (let i = 0; i < 256; i++) {
      totalSum += i * histogram[i];
    }
    
    let sumBack = 0;
    let pixelBack = 0;
    let pixelFront = 0;
    let maxVariance = 0;
    let threshold = 0;
    const total = pixels.length;

    for (let t = 0; t < 256; t++) {
      pixelBack += histogram[t];
      if (pixelBack === 0) continue;

      pixelFront = total - pixelBack;
      if (pixelFront === 0) break;

      sumBack += t * histogram[t];
      const mB = sumBack / pixelBack;
      const mF = (totalSum - sumBack) / pixelFront;

      const variance = pixelBack * pixelFront * (mB - mF) * (mB - mF);

      if (variance > maxVariance) {
        maxVariance = variance;
        threshold = t;
      }
    }
    
    threshold = Math.round(threshold * 0.55);
    console.log('✨ Optimal threshold found:', threshold);
    return threshold;
  };

  const findClosestColor = (targetColor: RGBColor, palette: ColorPalette): RGBColor => {
    if (palette.colors) {
      return palette.colors.reduce((closest, current) => {
        const currentDistance = colorDistance(targetColor, current);
        const closestDistance = colorDistance(targetColor, closest);
        return currentDistance < closestDistance ? current : closest;
      }, palette.colors[0]);
    } else if (palette.color1 && palette.color2) {
      const distance1 = colorDistance(targetColor, palette.color1);
      const distance2 = colorDistance(targetColor, palette.color2);
      return distance1 < distance2 ? palette.color1 : palette.color2;
    }
    return targetColor;
  };

  // 4x4 Bayer dithering matrisi
  const BAYER_MATRIX_4X4 = [
    [ 0,  8,  2, 10],
    [12,  4, 14,  6],
    [ 3, 11,  1,  9],
    [15,  7, 13,  5]
  ];

  const applyPreDither = (imageData: ImageData): ImageData => {
    console.log('🎨 Applying pre-dither adjustments...');
    const data = imageData.data;
    const width = imageData.width;

    for (let y = 0; y < imageData.height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        
        // Bayer matrix değerini al ve normalize et (0-1 arası)
        const bayerValue = BAYER_MATRIX_4X4[y % 4][x % 4] / 16;
        
        // Her kanal için contrast, brightness ve dithering uygula
        for (let c = 0; c < 3; c++) {
          // Normalize et (0-1 arası)
          let value = data[i + c] / 255;
          
          // Contrast %100
          value = (value - 0.5) * 1.0 + 0.5;
          
          // Brightness %100
          value = value * 1.0;
          
          // Dithering uygula
          value = value + (bayerValue - 0.5) * 0.1;
          
          // Sınırla ve geri dönüştür
          data[i + c] = Math.max(0, Math.min(255, Math.round(value * 255)));
        }
      }
    }
    
    return imageData;
  };

  const quantizeImage = (imageData: ImageData): ImageData => {
    console.log('🔄 Starting image quantization... Threshold:', manualThreshold);
    const data = imageData.data;
    let color1Count = 0;
    let color2Count = 0;

    for (let i = 0; i < data.length; i += 4) {
      const currentColor: Color = {
        r: data[i],
        g: data[i + 1],
        b: data[i + 2]
      };

      const closestColor = findClosestColor(currentColor, ColorPalettes[selectedPalette]);
      data[i] = closestColor.r;
      data[i + 1] = closestColor.g;
      data[i + 2] = closestColor.b;
      data[i + 3] = 255; // Alpha değerini 255 yapıyoruz
      
      if (closestColor === ColorPalettes[selectedPalette].color1) {
        color1Count++;
      } else {
        color2Count++;
      }
    }
    
    console.log('📈 Quantization completed:', {
      color1: color1Count,
      color2: color2Count,
      ratio: (color1Count / (color2Count || 1)).toFixed(3)
    });

    return imageData;
  };

  const createPixelArt = (img: HTMLImageElement): HTMLCanvasElement => {
    console.log('🎯 Creating pixel art... Threshold:', manualThreshold);
    const size = 64;
    const scale = 16; // 16 * 64 = 1024
    
    console.log('🔍 Preparing small canvas...');
    const smallCanvas = document.createElement('canvas');
    const smallCtx = smallCanvas.getContext('2d')!;
    smallCanvas.width = size;
    smallCanvas.height = size;
    
    smallCtx.imageSmoothingEnabled = false;
    smallCtx.drawImage(img, 0, 0, size, size);

    // Pre-dither uygula
    console.log('🎨 Applying pre-dither...');
    const preImageData = smallCtx.getImageData(0, 0, size, size);
    const preDitheredData = applyPreDither(preImageData);
    smallCtx.putImageData(preDitheredData, 0, 0);

    console.log('⚡ Applying quantization...');
    const imageData = smallCtx.getImageData(0, 0, size, size);
    const quantizedImageData = quantizeImage(imageData);
    smallCtx.putImageData(quantizedImageData, 0, 0);
    
    console.log('📐 Scaling to large canvas...');
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = size * scale;
    canvas.height = size * scale;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(smallCanvas, 0, 0, canvas.width, canvas.height);
    
    console.log('✅ Pixel art created successfully');
    return canvas;
  };

  try {
    const img = await loadImage(imageUrl);
    
    // First create a small canvas and draw the original image
    const size = 64;
    const smallCanvas = document.createElement('canvas');
    const smallCtx = smallCanvas.getContext('2d')!;
    smallCanvas.width = size;
    smallCanvas.height = size;
    smallCtx.imageSmoothingEnabled = false;
    smallCtx.drawImage(img, 0, 0, size, size);
    
    // Calculate optimal threshold from this canvas
    console.log('🧮 Calculating optimal threshold...');
    const imageData = smallCtx.getImageData(0, 0, size, size);
    manualThreshold = findOptimalThreshold(imageData);
    console.log('✨ Optimal threshold:', manualThreshold);
    
    // Now create the pixel art
    console.log('🎬 Creating pixel art...');
    const finalCanvas = createPixelArt(img);
    
    console.log('🏁 Process completed!');
    return finalCanvas.toDataURL('image/png');
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error processing image:', error.message);
      throw new Error(`Failed to process image: ${error.message}`);
    } else {
      console.error('Unknown error while processing image');
      throw new Error('An unexpected error occurred while processing the image.');
    }
  }
};

export const processImage = async (imageUrl: string): Promise<string> => {
  try {
    const img = await loadImage(imageUrl);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Canvas context not supported in your browser.');
    }

    // Set canvas dimensions
    canvas.width = img.width;
    canvas.height = img.height;

    // Draw image
    ctx.drawImage(img, 0, 0);

    return canvas.toDataURL('image/png');
  } catch (error) {
    if (error instanceof Error) {
      console.error('Error processing image:', error.message);
      throw new Error(`Failed to process image: ${error.message}`);
    } else {
      console.error('Unknown error while processing image');
      throw new Error('An unexpected error occurred while processing the image.');
    }
  }
};