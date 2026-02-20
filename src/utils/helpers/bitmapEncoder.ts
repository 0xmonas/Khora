/**
 * Bitmap encoding utilities for on-chain BOOA NFT storage.
 *
 * Replaces svgConverter.ts + svgMinifier.ts entirely.
 *
 * OLD pipeline (SVG):
 *   pixelateImage(url) → convertToSVG(dataUrl) → minifySVG(svg) → svgToBytes(minified) → contract
 *   Cost: 6-14KB on-chain, ~4.7M gas mint
 *
 * NEW pipeline (Bitmap):
 *   pixelateImage(url) → encodeBitmap(dataUrl) → contract
 *   Cost: 2,048 bytes on-chain (fixed), ~1.2M gas mint
 *
 * Bitmap format:
 *   2,048 bytes = 4,096 nibbles = 64×64 pixels
 *   Each nibble (4 bits) = C64 palette index (0-15)
 *   Byte layout: high nibble = even column, low nibble = odd column
 *   Row-major order: row 0 = bytes 0-31, row 1 = bytes 32-63, ... row 63 = bytes 2016-2047
 *
 * Security: No SVG validation needed — contract generates SVG itself from bitmap.
 *           Every nibble 0-15 maps to a valid C64 color. Injection impossible.
 */

// ══════════════════════════════════════════════════════════════
//  C64 PALETTE
// ══════════════════════════════════════════════════════════════

interface RGBColor {
    r: number;
    g: number;
    b: number;
  }
  
  /** C64 16-color palette — index order matches Solidity PALETTE constant */
  const C64_PALETTE: RGBColor[] = [
    { r: 0x00, g: 0x00, b: 0x00 }, //  0: #000000 Black
    { r: 0x62, g: 0x62, b: 0x62 }, //  1: #626262 Dark Grey
    { r: 0x89, g: 0x89, b: 0x89 }, //  2: #898989 Grey
    { r: 0xAD, g: 0xAD, b: 0xAD }, //  3: #ADADAD Light Grey
    { r: 0xFF, g: 0xFF, b: 0xFF }, //  4: #FFFFFF White
    { r: 0x9F, g: 0x4E, b: 0x44 }, //  5: #9F4E44 Brown-Red
    { r: 0xCB, g: 0x7E, b: 0x75 }, //  6: #CB7E75 Salmon
    { r: 0x6D, g: 0x54, b: 0x12 }, //  7: #6D5412 Dark Brown
    { r: 0xA1, g: 0x68, b: 0x3C }, //  8: #A1683C Orange-Brown
    { r: 0xC9, g: 0xD4, b: 0x87 }, //  9: #C9D487 Lime
    { r: 0x9A, g: 0xE2, b: 0x9B }, // 10: #9AE29B Light Green
    { r: 0x5C, g: 0xAB, b: 0x5E }, // 11: #5CAB5E Green
    { r: 0x6A, g: 0xBF, b: 0xC6 }, // 12: #6ABFC6 Cyan
    { r: 0x88, g: 0x7E, b: 0xCB }, // 13: #887ECB Purple
    { r: 0x50, g: 0x45, b: 0x9B }, // 14: #50459B Dark Purple
    { r: 0xA0, g: 0x57, b: 0xA3 }, // 15: #A057A3 Magenta
  ];
  
  /** Hex strings for each palette index (uppercase, 6-char) */
  const C64_HEX: string[] = [
    '000000', '626262', '898989', 'ADADAD', 'FFFFFF',
    '9F4E44', 'CB7E75', '6D5412', 'A1683C', 'C9D487',
    '9AE29B', '5CAB5E', '6ABFC6', '887ECB', '50459B',
    'A057A3',
  ];
  
  /**
   * Pre-computed lookup: RGB key → palette index.
   * Key = (r << 16) | (g << 8) | b
   * For exact matches from the pixelator (which already quantizes to C64).
   */
  const EXACT_LOOKUP = new Map<number, number>();
  C64_PALETTE.forEach((c, i) => {
    EXACT_LOOKUP.set((c.r << 16) | (c.g << 8) | c.b, i);
  });
  
  /** Find nearest C64 palette index by Euclidean distance. */
  function nearestPaletteIndex(r: number, g: number, b: number): number {
    // Fast path: exact match (pixelator already quantized)
    const key = (r << 16) | (g << 8) | b;
    const exact = EXACT_LOOKUP.get(key);
    if (exact !== undefined) return exact;
  
    // Slow path: nearest neighbor (fallback for non-quantized input)
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
  
  // ══════════════════════════════════════════════════════════════
  //  CONSTANTS
  // ══════════════════════════════════════════════════════════════
  
  /** Bitmap size in bytes: 64×64 pixels × 4 bits / 8 = 2,048 */
  export const BITMAP_SIZE = 2048;
  
  /** Grid dimension */
  export const GRID_SIZE = 64;
  
  /** SSTORE2 maximum data size per pointer (24KB) */
  export const SSTORE2_MAX_BYTES = 24576;
  
  // ══════════════════════════════════════════════════════════════
  //  IMAGE LOADING
  // ══════════════════════════════════════════════════════════════
  
  /** Load an image from a URL or data URI. */
  function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Failed to load image'));
      try {
        img.src = url;
      } catch {
        reject(new Error('Invalid image URL or format'));
      }
    });
  }
  
  // ══════════════════════════════════════════════════════════════
  //  CORE: IMAGE → BITMAP (2,048 bytes)
  // ══════════════════════════════════════════════════════════════
  
  /**
   * Encodes a pixelated image into a 2,048-byte bitmap.
   *
   * This replaces the entire convertToSVG → minifySVG → svgToBytes pipeline.
   *
   * @param imageUrl - Data URL or HTTP URL of the pixelated image
   *                   (typically the output of pixelateImage())
   * @param size     - Grid size (default 64). Must be 64 for on-chain contract.
   * @returns Uint8Array of exactly 2,048 bytes ready for contract call
   *
   * @example
   * // Old pipeline (3 steps, 6-14KB output):
   * const svgString = await convertToSVG(pixelatedImage);
   * const minified = minifySVG(svgString);
   * const bytes = svgToBytes(minified);
   *
   * // New pipeline (1 step, 2,048 bytes output):
   * const bytes = await encodeBitmap(pixelatedImage);
   */
  export async function encodeBitmap(imageUrl: string, size: number = GRID_SIZE): Promise<Uint8Array> {
    const img = await loadImage(imageUrl);
  
    // Downscale to grid size (64×64)
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    canvas.width = size;
    canvas.height = size;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, size, size);
  
    const imageData = ctx.getImageData(0, 0, size, size).data;
  
    // Pack pixels into 4-bit nibbles: 2 pixels per byte
    // High nibble = even column (x=0,2,4,...), low nibble = odd column (x=1,3,5,...)
    const bytesPerRow = size / 2; // 32 bytes per row for 64px
    const bitmap = new Uint8Array(size * bytesPerRow); // 64 * 32 = 2048
  
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x += 2) {
        const i0 = (y * size + x) * 4;
        const i1 = (y * size + x + 1) * 4;
  
        const idx0 = nearestPaletteIndex(imageData[i0], imageData[i0 + 1], imageData[i0 + 2]);
        const idx1 = nearestPaletteIndex(imageData[i1], imageData[i1 + 1], imageData[i1 + 2]);
  
        bitmap[y * bytesPerRow + (x >> 1)] = (idx0 << 4) | idx1;
      }
    }
  
    return bitmap;
  }
  
  // ══════════════════════════════════════════════════════════════
  //  CLIENT-SIDE SVG RECONSTRUCTION (for preview / download)
  // ══════════════════════════════════════════════════════════════
  
  /**
   * Reconstructs SVG from a 2,048-byte bitmap.
   * Output format is identical to what the Solidity _renderSVG() produces:
   *   - Background rect with most frequent color
   *   - One <path stroke="#color"> per non-background color
   *   - Horizontal run encoding: M{x} {y}h{len}
   *
   * Use this for:
   *   - Displaying previews in the UI
   *   - SVG download export
   *   - Verifying bitmap→SVG round-trip matches pixelator output
   */
  export function bitmapToSVG(bitmap: Uint8Array, size: number = GRID_SIZE): string {
    if (bitmap.length !== BITMAP_SIZE) {
      throw new Error(`Invalid bitmap: expected ${BITMAP_SIZE} bytes, got ${bitmap.length}`);
    }
  
    const bytesPerRow = size / 2;
  
    // Helper: read pixel at (x, y) → palette index 0-15
    const getPixel = (x: number, y: number): number => {
      const b = bitmap[y * bytesPerRow + (x >> 1)];
      return (x & 1) === 0 ? (b >> 4) : (b & 0x0F);
    };
  
    // Count color frequency
    const counts = new Uint32Array(16);
    for (let i = 0; i < BITMAP_SIZE; i++) {
      counts[bitmap[i] >> 4]++;
      counts[bitmap[i] & 0x0F]++;
    }
  
    // Find background (most frequent color)
    let bgColor = 0;
    let maxCount = 0;
    for (let c = 0; c < 16; c++) {
      if (counts[c] > maxCount) {
        maxCount = counts[c];
        bgColor = c;
      }
    }
  
    // Build SVG
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -0.5 ${size} ${size}" shape-rendering="crispEdges">`;
    svg += `<rect fill="#${C64_HEX[bgColor]}" width="${size}" height="${size}"/>`;
  
    // One <path> per non-background color
    for (let color = 0; color < 16; color++) {
      if (color === bgColor || counts[color] === 0) continue;
  
      const segments: string[] = [];
  
      for (let y = 0; y < size; y++) {
        let x = 0;
        while (x < size) {
          if (getPixel(x, y) !== color) {
            x++;
            continue;
          }
          const startX = x;
          while (x < size && getPixel(x, y) === color) x++;
          segments.push(`M${startX} ${y}h${x - startX}`);
        }
      }
  
      if (segments.length > 0) {
        svg += `<path stroke="#${C64_HEX[color]}" d="${segments.join('')}"/>`;
      }
    }
  
    svg += '</svg>';
    return svg;
  }
  
  /**
   * Reconstructs SVG from bitmap and returns as a data URI.
   * Useful for <img src=...> display in the UI.
   */
  export function bitmapToSVGDataURI(bitmap: Uint8Array): string {
    const svg = bitmapToSVG(bitmap);
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }
  
  // ══════════════════════════════════════════════════════════════
  //  VALIDATION
  // ══════════════════════════════════════════════════════════════
  
  /**
   * Validates bitmap bytes against the contract's requirements.
   * Returns null if valid, or an error message if it would be rejected.
   *
   * Replaces validateSvgForContract().
   * The only check is length — every nibble value (0-15) is a valid palette index.
   */
  export function validateBitmapForContract(bytes: Uint8Array): string | null {
    if (bytes.length !== BITMAP_SIZE) {
      return `Invalid bitmap size: expected ${BITMAP_SIZE} bytes, got ${bytes.length}`;
    }
    return null;
  }
  
  // ══════════════════════════════════════════════════════════════
  //  SANITIZATION (no-op for bitmap — kept for API compatibility)
  // ══════════════════════════════════════════════════════════════
  
  /**
   * Sanitizes bitmap bytes loaded from cache/API.
   *
   * Replaces sanitizeSvgBytes().
   * For bitmaps this is a no-op: there are no <style> tags or injection vectors
   * to clean. The function just validates length and returns the bytes as-is.
   */
  export function sanitizeBitmapBytes(bytes: Uint8Array): Uint8Array {
    if (bytes.length !== BITMAP_SIZE) {
      throw new Error(`Invalid bitmap: expected ${BITMAP_SIZE} bytes, got ${bytes.length}`);
    }
    return bytes;
  }
  
  // ══════════════════════════════════════════════════════════════
  //  BYTE UTILITIES
  // ══════════════════════════════════════════════════════════════
  
  /**
   * Returns the bitmap as-is (already bytes).
   * Replaces svgToBytes() for API compatibility.
   */
  export function bitmapToBytes(bitmap: Uint8Array): Uint8Array {
    return bitmap;
  }
  
  /**
   * Returns the byte size of a bitmap.
   * Replaces svgByteSize() for API compatibility.
   * Always returns BITMAP_SIZE (2048) for a valid bitmap.
   */
  export function bitmapByteSize(bitmap: Uint8Array): number {
    return bitmap.length;
  }
  
  // ══════════════════════════════════════════════════════════════
  //  DOWNLOAD / EXPORT
  // ══════════════════════════════════════════════════════════════
  
  /**
   * Creates a downloadable SVG blob from a pixelated image.
   * Replaces createSVGBlob().
   *
   * Encodes the image to bitmap first, then reconstructs SVG.
   * This ensures the downloaded SVG is pixel-perfect identical
   * to what the contract's tokenURI will produce.
   */
  export async function createSVGBlob(imageUrl: string): Promise<Blob> {
    const bitmap = await encodeBitmap(imageUrl);
    const svg = bitmapToSVG(bitmap);
    return new Blob([svg], { type: 'image/svg+xml' });
  }
  
  /**
   * Creates a downloadable raw bitmap blob.
   * Useful for debugging or if users want the raw pixel data.
   */
  export async function createBitmapBlob(imageUrl: string): Promise<Blob> {
    const bitmap = await encodeBitmap(imageUrl);
    return new Blob([new Uint8Array(bitmap)], { type: 'application/octet-stream' });
  }
  
  // ══════════════════════════════════════════════════════════════
  //  BACKWARD-COMPATIBLE ALIASES
  //  (so GeneratorContext can migrate incrementally)
  // ══════════════════════════════════════════════════════════════
  
  /**
   * Drop-in replacement for convertToSVG().
   * Returns SVG string (for preview), but the contract should receive
   * the bitmap from encodeBitmap() instead.
   *
   * @deprecated Use encodeBitmap() for contract calls, bitmapToSVG() for preview.
   */
  export async function convertToSVG(imageUrl: string, size: number = GRID_SIZE): Promise<string> {
    const bitmap = await encodeBitmap(imageUrl, size);
    return bitmapToSVG(bitmap, size);
  }
  
  /**
   * No-op. Bitmap is already minimal at 2,048 bytes.
   * @deprecated Not needed with bitmap pipeline.
   */
  export function minifySVG(svg: string): string {
    return svg;
  }
  
  /**
   * Alias for new TextEncoder().encode(). Kept for backward compat.
   * @deprecated Use encodeBitmap() which returns bytes directly.
   */
  export function svgToBytes(svg: string): Uint8Array {
    return new TextEncoder().encode(svg);
  }
  
  /**
   * Returns byte length of a string. Kept for backward compat.
   * @deprecated Use bitmapByteSize() or just bitmap.length.
   */
  export function svgByteSize(svg: string): number {
    return new TextEncoder().encode(svg).length;
  }
  
  /**
   * Alias for sanitizeBitmapBytes(). Kept for backward compat.
   * @deprecated Use sanitizeBitmapBytes().
   */
  export function sanitizeSvgBytes(bytes: Uint8Array): Uint8Array {
    // If the incoming bytes are a legacy SVG (from Redis/API recovery),
    // they won't be BITMAP_SIZE. In that case, pass through as-is
    // to avoid breaking existing cached reveal data.
    if (bytes.length !== BITMAP_SIZE) {
      return bytes;
    }
    return sanitizeBitmapBytes(bytes);
  }
  
  /**
   * Alias for validateBitmapForContract(). Kept for backward compat.
   * @deprecated Use validateBitmapForContract().
   */
  export function validateSvgForContract(bytes: Uint8Array): string | null {
    // If the incoming bytes are not BITMAP_SIZE, they might be legacy SVG.
    // For legacy SVGs, do the old unsafe-tag check.
    if (bytes.length !== BITMAP_SIZE) {
      const svg = new TextDecoder().decode(bytes).toLowerCase();
      const unsafeTags = [
        'script', 'style', 'iframe', 'object', 'embed',
        'foreignobject', 'feimage', 'animate', 'image',
      ];
      for (const tag of unsafeTags) {
        if (svg.includes(`<${tag}`)) {
          return `SVG contains <${tag}> which the contract rejects. Please regenerate.`;
        }
      }
      return null;
    }
    return validateBitmapForContract(bytes);
  }
  
  // ══════════════════════════════════════════════════════════════
  //  PALETTE EXPORTS (for external use)
  // ══════════════════════════════════════════════════════════════
  
  export { C64_PALETTE, C64_HEX, nearestPaletteIndex };