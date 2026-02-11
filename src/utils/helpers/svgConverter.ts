/**
 * SVG conversion utilities for pixel art images.
 *
 * Compact on-chain SVG strategy:
 * 1. Majority color = background rect (1 element)
 * 2. Minority color = single <path> with row-based horizontal runs
 * 3. Inline stroke attribute per <path> (no <style> tag for on-chain safety)
 * 4. For 2-tone images: 1 bg rect + 1 path element = minimal overhead
 *
 * For a dithered 2-tone 64x64 image: ~6-14KB (vs ~48KB before)
 */

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase();
}

function shortenHex(hex: string): string {
  if (hex.length !== 7) return hex;
  if (hex[1] === hex[2] && hex[3] === hex[4] && hex[5] === hex[6]) {
    return `#${hex[1]}${hex[3]}${hex[5]}`;
  }
  return hex;
}

const getAspectRatios = (baseSize: number) => ({
  SQUARE: { width: baseSize, height: baseSize },
  PORTRAIT: { width: Math.round(baseSize * 0.75), height: baseSize },
  LANDSCAPE: { width: baseSize, height: Math.round(baseSize * 0.75) },
  WIDE: { width: baseSize, height: Math.round(baseSize * 0.5625) },
  TALL: { width: Math.round(baseSize * 0.5625), height: baseSize }
});

const findClosestAspectRatio = (width: number, height: number, baseSize: number = 64) => {
  const ratio = width / height;
  const AR = getAspectRatios(baseSize);
  if (ratio > 1.7) return AR.WIDE;
  if (ratio > 1.2) return AR.LANDSCAPE;
  if (ratio > 0.8) return AR.SQUARE;
  if (ratio > 0.6) return AR.PORTRAIT;
  return AR.TALL;
};

/**
 * Converts an image to a compact SVG.
 *
 * For 2-tone (dithered pixel art):
 * - Background = majority color as a single <rect fill="...">
 * - Foreground = one <path> per color with all horizontal runs
 * - Inline stroke attribute on each <path> (no <style> tag)
 * - viewBox uses -0.5 y offset for stroke-based rendering
 */
export async function convertToSVG(imageUrl: string, size: number = 64): Promise<string> {
  const tempImg = new Image();
  tempImg.src = imageUrl;
  await new Promise<void>((resolve) => { tempImg.onload = () => resolve(); });

  const dimensions = findClosestAspectRatio(tempImg.width, tempImg.height, size);
  const w = dimensions.width;
  const h = dimensions.height;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;
  canvas.width = w;
  canvas.height = h;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tempImg, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;

  // Build grid + count colors
  const colorCount: Record<string, number> = {};
  const grid: string[][] = [];

  for (let y = 0; y < h; y++) {
    grid[y] = [];
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const hex = rgbToHex(data[i], data[i + 1], data[i + 2]);
      grid[y][x] = hex;
      colorCount[hex] = (colorCount[hex] || 0) + 1;
    }
  }

  const sortedColors = Object.entries(colorCount).sort((a, b) => b[1] - a[1]);
  if (sortedColors.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"/>`;
  }

  const bgColor = shortenHex(sortedColors[0][0]);
  const fgColors = sortedColors.slice(1); // minority colors

  // Build one <path> per foreground color with all horizontal runs
  const paths: string[] = [];

  for (let ci = 0; ci < fgColors.length; ci++) {
    const color = fgColors[ci][0];
    const segments: string[] = [];

    for (let y = 0; y < h; y++) {
      let x = 0;
      while (x < w) {
        if (grid[y][x] === color) {
          const startX = x;
          while (x < w && grid[y][x] === color) x++;
          segments.push(`M${startX} ${y}h${x - startX}`);
        } else {
          x++;
        }
      }
    }

    if (segments.length > 0) {
      paths.push(`<path stroke="${shortenHex(color)}" d="${segments.join('')}"/>`);
    }
  }

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -0.5 ${w} ${h}" shape-rendering="crispEdges">`;
  svg += `<rect fill="${bgColor}" width="${w}" height="${h}"/>`;
  svg += paths.join('');
  svg += '</svg>';

  return svg;
}

/**
 * Creates downloadable SVG blob from image URL
 */
export async function createSVGBlob(imageUrl: string): Promise<Blob> {
  const svg = await convertToSVG(imageUrl);
  return new Blob([svg], { type: 'image/svg+xml' });
}
