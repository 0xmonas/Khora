/** Ensure image data URI is small enough for on-chain storage.
 *  Non-data URIs (https://, ipfs://, ar://) pass through as-is (just a reference).
 *  Small data URIs (<6KB) pass through. Anything bigger — SVG or PNG — is
 *  rasterized to a 64x64 PNG. A BOOA's ~9KB on-chain SVG becomes ~1KB, which
 *  cuts adapter register gas from ~7M to ~1.5M. For 64x64 pixel art this is
 *  lossless; the full-fidelity art always remains on the bound NFT itself. */
export function ensureSmallImageURI(dataURI: string): Promise<string> {
  if (!dataURI.startsWith('data:')) return Promise.resolve(dataURI);
  if (dataURI.length < 6_000) return Promise.resolve(dataURI);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 64;
      canvas.height = 64;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, 64, 64);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve('');
    img.src = dataURI;
  });
}
