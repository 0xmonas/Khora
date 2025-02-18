interface Color {
    r: number;
    g: number;
    b: number;
  }
  
  interface ImageSettings {
    contrast: number;
    brightness: number;
    dithering: number;
    threshold: number;
  }
  
  const hexToRgb = (hex: string): Color => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  };
  
  const MIDWEST_COLORS = [
    '#e7cfab', '#b9ba7e', '#8e9359', '#646641', '#7f8fa6',
    '#ccdcf5', '#fcfcfa', '#73abd8', '#cc403e', '#1d1610',
    '#573d27', '#b27f5a',
    // New added colors
    '#eca73b', '#fcd856', '#966a64', '#4d8eca', '#c0c7d3',
    '#fbe9c3', '#fca95a', '#444b4e', '#e0785c', '#bd9d86',
    '#32291f', '#f6db91', '#e4ceb3'
  ].map(hexToRgb);
  
  const ColorPalettes = {
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
      colors: MIDWEST_COLORS
    }
  };
  
  type PaletteType = 'DEFAULT' | 'MONOCHROME' | 'EXPERIMENTAL' | 'MIDWEST';
  
  // Standard image ratios
  const ASPECT_RATIOS = {
    SQUARE: { width: 64, height: 64 },     // 1:1
    PORTRAIT: { width: 48, height: 64 },   // 3:4
    LANDSCAPE: { width: 64, height: 48 },  // 4:3
    WIDE: { width: 64, height: 36 },       // 16:9
    TALL: { width: 36, height: 64 }        // 9:16
  } as const;
  
  const findClosestAspectRatio = (width: number, height: number) => {
    const ratio = width / height;
    
    // Find closest ratio
    if (ratio > 1.7) return ASPECT_RATIOS.WIDE;        // 16:9
    if (ratio > 1.2) return ASPECT_RATIOS.LANDSCAPE;   // 4:3
    if (ratio > 0.8) return ASPECT_RATIOS.SQUARE;      // 1:1
    if (ratio > 0.6) return ASPECT_RATIOS.PORTRAIT;    // 3:4
    return ASPECT_RATIOS.TALL;                         // 9:16
  };
  
  const findDominantColors = (imageData: ImageData): { color1: Color; color2: Color } => {
    const data = imageData.data;
    const colorMap = new Map<string, number>();
    
    // Collect colors and count them
    for (let i = 0; i < data.length; i += 4) {
      const r = Math.round(data[i] / 32) * 32;     // Reduce color space
      const g = Math.round(data[i + 1] / 32) * 32;
      const b = Math.round(data[i + 2] / 32) * 32;
      const key = `${r},${g},${b}`;
      colorMap.set(key, (colorMap.get(key) || 0) + 1);
    }
    
    // Sort colors by usage frequency
    const sortedColors = Array.from(colorMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([key]) => {
        const [r, g, b] = key.split(',').map(Number);
        return { r, g, b };
      });
    
    // Select the two most used colors
    const color1 = sortedColors[0];
    const color2 = sortedColors[Math.floor(sortedColors.length / 2)]; // Take the middle point color
    
    return { color1, color2 };
  };
  
  // Color distance calculation function
  const colorDistance = (color1: Color, color2: Color): number => {
    const rDiff = color1.r - color2.r;
    const gDiff = color1.g - color2.g;
    const bDiff = color1.b - color2.b;
    return Math.sqrt(rDiff * rDiff + gDiff * gDiff + bDiff * bDiff);
  };
  
  // Find closest color function
  const findClosestMidwestColor = (color: Color): Color => {
    let minDistance = Infinity;
    let closestColor = MIDWEST_COLORS[0];
  
    for (const paletteColor of MIDWEST_COLORS) {
      const distance = colorDistance(color, paletteColor);
      if (distance < minDistance) {
        minDistance = distance;
        closestColor = paletteColor;
      }
    }
  
    return closestColor;
  };
  
  export const pixalteImage = async (
    imageUrl: string,
    selectedPalette: 'DEFAULT' | 'MONOCHROME' | 'EXPERIMENTAL' | 'MIDWEST' = 'DEFAULT',
    settings: ImageSettings = {
      threshold: 127,
      contrast: 100,
      brightness: 100,
      dithering: 10
    }
  ): Promise<string> => {
    console.log('🚀 Starting... Selected palette:', selectedPalette);
    let manualThreshold = settings.threshold;
  
    const loadImage = (url: string): Promise<HTMLImageElement> => {
      console.log('📥 Loading image:', url);
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';  // Required for CORS
        
        // Load successful
        img.onload = () => {
          console.log('✅ Image loaded successfully');
          resolve(img);
        };
        
        // Load error
        img.onerror = () => {
          const error = new Error('Failed to load image. Please check if the image is valid and accessible.');
          console.error('❌ Image load error:', error.message);
          reject(error);
        };
  
        // Add timeout
        const timeout = setTimeout(() => {
          const error = new Error('Image load timed out. Please try again.');
          console.error('❌ Image load timeout:', error.message);
          reject(error);
        }, 30000); // 30 seconds timeout
  
        // Set URL last
        try {
          img.src = url;
        } catch (error) {
          clearTimeout(timeout);
          console.error('❌ Invalid image URL:', error);
          reject(new Error('Invalid image URL. Please check the image source.'));
        }
  
        // Cleanup
        img.onload = () => {
          clearTimeout(timeout);
          console.log('✅ Image loaded successfully');
          resolve(img);
        };
      });
    };
  
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
  
    const findClosestColor = (color: Color): Color => {
      if (selectedPalette === 'MIDWEST') {
        return findClosestMidwestColor(color);
      }
  
      const palette = ColorPalettes[selectedPalette];
      const brightness = (color.r * 0.299 + color.g * 0.587 + color.b * 0.114);
      const selectedColor = (brightness * 0.55) > manualThreshold ? palette.color2 : palette.color1;
      
      if (Math.random() < 0.01) {
        console.log('🎨 Color transformation:', {
          input: `rgb(${color.r},${color.g},${color.b})`,
          brightness: brightness.toFixed(2),
          adjustedBrightness: (brightness * 0.55).toFixed(2),
          threshold: manualThreshold,
          output: selectedColor === palette.color1 ? 'color1' : 'color2'
        });
      }
      
      return selectedColor;
    };
  
    // 4x4 Bayer dithering matrix
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
          
          // Get Bayer matrix value and normalize it (0-1 range)
          const bayerValue = BAYER_MATRIX_4X4[y % 4][x % 4] / 16;
          
          // Apply contrast, brightness and dithering for each channel
          for (let c = 0; c < 3; c++) {
            // Normalize (0-1 range)
            let value = data[i + c] / 255;
            
            // Contrast adjustment
            value = ((value - 0.5) * (settings.contrast / 100)) + 0.5;
            
            // Brightness adjustment
            value = value * (settings.brightness / 100);
            
            // Apply dithering
            value = value + (bayerValue - 0.5) * (settings.dithering / 100);
            
            // Clamp and convert back
            data[i + c] = Math.max(0, Math.min(255, Math.round(value * 255)));
          }
        }
      }
      
      return imageData;
    };
  
    const quantizeImage = (imageData: ImageData): ImageData => {
      console.log('🔄 Starting image quantization... Threshold:', manualThreshold);
      const data = imageData.data;
      const colorCounts = new Map<string, number>();
  
      for (let i = 0; i < data.length; i += 4) {
        const currentColor: Color = {
          r: data[i],
          g: data[i + 1],
          b: data[i + 2]
        };
  
        const closestColor = findClosestColor(currentColor);
        data[i] = closestColor.r;
        data[i + 1] = closestColor.g;
        data[i + 2] = closestColor.b;
        data[i + 3] = 255; // Set alpha to 255
        
        // Collect color usage statistics
        const colorKey = `${closestColor.r},${closestColor.g},${closestColor.b}`;
        colorCounts.set(colorKey, (colorCounts.get(colorKey) || 0) + 1);
      }
      
      // Log statistics
      console.log('📈 Quantization completed:', {
        uniqueColors: colorCounts.size,
        colorUsage: Array.from(colorCounts.entries()).map(([color, count]) => ({
          color,
          count,
          percentage: ((count / (data.length / 4)) * 100).toFixed(2) + '%'
        }))
      });
  
      return imageData;
    };
  
    const createPixelArt = (img: HTMLImageElement): HTMLCanvasElement => {
      console.log('🎯 Creating pixel art... Threshold:', manualThreshold);
      
      // Select optimal ratio automatically
      const dimensions = findClosestAspectRatio(img.width, img.height);
      console.log('📐 Selected dimensions:', dimensions);
      
      const scale = 16; // 16x scaling factor
      
      console.log('🔍 Preparing small canvas...');
      const smallCanvas = document.createElement('canvas');
      const smallCtx = smallCanvas.getContext('2d')!;
      smallCanvas.width = dimensions.width;
      smallCanvas.height = dimensions.height;
      
      smallCtx.imageSmoothingEnabled = false;
      smallCtx.drawImage(img, 0, 0, dimensions.width, dimensions.height);
  
      // Apply pre-dither
      console.log('🎨 Applying pre-dither...');
      const preImageData = smallCtx.getImageData(0, 0, dimensions.width, dimensions.height);
      const preDitheredData = applyPreDither(preImageData);
      smallCtx.putImageData(preDitheredData, 0, 0);
  
      console.log('⚡ Applying quantization...');
      const imageData = smallCtx.getImageData(0, 0, dimensions.width, dimensions.height);
      const quantizedImageData = quantizeImage(imageData);
      smallCtx.putImageData(quantizedImageData, 0, 0);
      
      console.log('📐 Scaling to large canvas...');
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = dimensions.width * scale;
      canvas.height = dimensions.height * scale;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(smallCanvas, 0, 0, canvas.width, canvas.height);
      
      console.log('✅ Pixel art created successfully');
      return canvas;
    };
  
    try {
      const img = await loadImage(imageUrl);
      
      // Select optimal ratio automatically
      const dimensions = findClosestAspectRatio(img.width, img.height);
      console.log('🔄 Processing image with dimensions:', dimensions);
      
      const smallCanvas = document.createElement('canvas');
      const smallCtx = smallCanvas.getContext('2d')!;
      smallCanvas.width = dimensions.width;
      smallCanvas.height = dimensions.height;
      smallCtx.imageSmoothingEnabled = false;
      smallCtx.drawImage(img, 0, 0, dimensions.width, dimensions.height);
  
      // If EXPERIMENTAL palette is selected, find dominant colors
      if (selectedPalette === 'EXPERIMENTAL') {
        const imageData = smallCtx.getImageData(0, 0, dimensions.width, dimensions.height);
        const dominantColors = findDominantColors(imageData);
        ColorPalettes.EXPERIMENTAL.color1 = dominantColors.color1;
        ColorPalettes.EXPERIMENTAL.color2 = dominantColors.color2;
        console.log('🎨 Experimental palette colors:', dominantColors);
      }
  
      // Calculate optimal threshold
      console.log('🧮 Calculating optimal threshold...');
      const imageData = smallCtx.getImageData(0, 0, dimensions.width, dimensions.height);
      manualThreshold = findOptimalThreshold(imageData);
      console.log('✨ Optimal threshold:', manualThreshold);
      
      // Now create the pixel art
      console.log('🎬 Creating pixel art...');
      const finalCanvas = createPixelArt(img);
      
      console.log('🏁 Process completed!');
      return finalCanvas.toDataURL('image/png');
    } catch (error) {
      console.error('❌ Error:', error);
      throw error;
    }
  }; 