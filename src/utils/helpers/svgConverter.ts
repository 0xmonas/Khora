/**
 * SVG conversion utilities for pixel art images
 * Converts 64x64 pixel art to optimized SVG paths
 */

/**
 * Converts a decimal color component to hexadecimal
 */
function componentToHex(c: number): string {
    const hex = parseInt(c.toString()).toString(16);
    return hex.length == 1 ? "0" + hex : hex;
  }
  
  /**
   * Converts RGBA values to SVG color string
   * Returns false if pixel is transparent
   */
  function getColor(r: number, g: number, b: number, a: number): string | false {
    if (a === 0) return false;
    if (a === undefined || a === 255) {
      return "#" + componentToHex(r) + componentToHex(g) + componentToHex(b);
    }
    return `rgba(${r},${g},${b},${a/255})`;
  }
  
  /**
   * Creates SVG path data for a horizontal line
   */
  function makePathData(x: number, y: number, w: number): string {
    return `M${x} ${y}h${w}`;
  }
  
  /**
   * Creates complete SVG path element with color
   */
  function makePath(color: string, data: string): string {
    return `<path stroke="${color}" d="${data}" />\n`;
  }
  
  /**
   * Groups pixels by color from ImageData
   */
  function getColors(img: ImageData): Record<string, [number, number][]> {
    const colors: Record<string, [number, number][]> = {};
    const data = img.data;
    const w = img.width;
  
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) {
        const color = `${data[i]},${data[i + 1]},${data[i + 2]},${data[i + 3]}`;
        colors[color] = colors[color] || [];
        const x = (i / 4) % w;
        const y = Math.floor((i / 4) / w);
        colors[color].push([x, y]);
      }
    }
    return colors;
  }
  
  /**
   * Converts color groups to optimized SVG paths
   */
  function colorsToPaths(colors: Record<string, [number, number][]>): string {
    let output = "";
    for (const [colorKey, pixels] of Object.entries(colors)) {
      const [r, g, b, a] = colorKey.split(',').map(Number);
      const color = getColor(r, g, b, a);
      if (!color) continue;
  
      let paths: string[] = [];
      let curPath: [number, number] | null = null;
      let w = 1;
  
      for (const pixel of pixels) {
        if (curPath && pixel[1] === curPath[1] && pixel[0] === (curPath[0] + w)) {
          w++;
        } else {
          if (curPath) {
            paths.push(makePathData(curPath[0], curPath[1], w));
            w = 1;
          }
          curPath = pixel;
        }
      }
      if (curPath) {
        paths.push(makePathData(curPath[0], curPath[1], w));
      }
      output += makePath(color, paths.join(''));
    }
    return output;
  }
  
  /**
   * Converts an image to SVG format
   * @param imageUrl - URL of the image to convert
   * @returns Promise that resolves to SVG string
   */
  export async function convertToSVG(imageUrl: string): Promise<string> {
    // Create temporary 64x64 canvas
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = 64;
    canvas.height = 64;
    
    // Load and draw image
    const img = new Image();
    img.src = imageUrl;
    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
    });
    
    ctx.drawImage(img, 0, 0, 64, 64);
    const imageData = ctx.getImageData(0, 0, 64, 64);
    
    // Convert to SVG
    const colors = getColors(imageData);
    const paths = colorsToPaths(colors);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -0.5 64 64" shape-rendering="crispEdges">\n${paths}</svg>`;
  }
  
  /**
   * Creates downloadable SVG blob from image URL
   * @param imageUrl - URL of the image to convert
   * @param fileName - Name for the downloaded file
   * @returns Promise that resolves to Blob
   */
  export async function createSVGBlob(imageUrl: string): Promise<Blob> {
    const svg = await convertToSVG(imageUrl);
    return new Blob([svg], { type: 'image/svg+xml' });
  }