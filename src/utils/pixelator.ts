interface Color {
    r: number;
    g: number;
    b: number;
  }
  
  export const pixelateImage = async (imageUrl: string): Promise<string> => {
    const loadImage = (url: string): Promise<HTMLImageElement> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });
    };
  
    const findOptimalThreshold = (imageData: ImageData): number => {
      const pixels: number[] = [];
      const data = imageData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const brightness = r * 0.299 + g * 0.587 + b * 0.114;
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
      return threshold;
    };
  
    const findClosestColor = (color: Color, threshold: number): Color => {
      const color1: Color = { r: 51, g: 0, b: 255 };  // #3300ff (mavi)
      const color2: Color = { r: 242, g: 242, b: 242 }; // #f2f2f2 (açık gri)
      
      const brightness = (color.r * 0.299 + color.g * 0.587 + color.b * 0.114) * 0.55;
      
      return brightness > threshold ? color2 : color1;
    };
  
    const quantizeImage = (imageData: ImageData, threshold: number): ImageData => {
      const data = imageData.data;
  
      for (let i = 0; i < data.length; i += 4) {
        const currentColor: Color = {
          r: data[i],
          g: data[i + 1],
          b: data[i + 2]
        };
  
        const closestColor = findClosestColor(currentColor, threshold);
        data[i] = closestColor.r;
        data[i + 1] = closestColor.g;
        data[i + 2] = closestColor.b;
      }
  
      return imageData;
    };
  
    const createPixelArt = (img: HTMLImageElement, threshold: number): HTMLCanvasElement => {
      const size = 64;
      const scale = 16; // 16 * 64 = 1024
      
      const smallCanvas = document.createElement('canvas');
      const smallCtx = smallCanvas.getContext('2d')!;
      smallCanvas.width = size;
      smallCanvas.height = size;
      
      smallCtx.imageSmoothingEnabled = false;
      smallCtx.drawImage(img, 0, 0, size, size);
  
      const imageData = smallCtx.getImageData(0, 0, size, size);
      const quantizedImageData = quantizeImage(imageData, threshold);
      smallCtx.putImageData(quantizedImageData, 0, 0);
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      canvas.width = size * scale;
      canvas.height = size * scale;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(smallCanvas, 0, 0, canvas.width, canvas.height);
      
      return canvas;
    };
  
    try {
      const img = await loadImage(imageUrl);
      
      // First run with default threshold
      const firstCanvas = createPixelArt(img, 127);
      
      // Calculate optimal threshold
      const imageData = firstCanvas.getContext('2d')!.getImageData(0, 0, firstCanvas.width, firstCanvas.height);
      const optimalThreshold = findOptimalThreshold(imageData);
      
      // Second run with optimal threshold
      const finalCanvas = createPixelArt(img, optimalThreshold);
      
      return finalCanvas.toDataURL('image/png');
    } catch (error) {
      console.error('Pixelation error:', error);
      throw error;
    }
  };