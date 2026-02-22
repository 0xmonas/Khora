/** Ensure image data URI is small enough for on-chain storage.
 *  SVG data URIs (~6KB) pass through. Large PNG data URIs (>50KB) get downscaled to 64x64.
 *  Non-data URIs (https://, ipfs://, ar://) pass through as-is. */
export function ensureSmallImageURI(dataURI: string): Promise<string> {
  // Non-data URIs (https://, ipfs://, ar://) are fine — just a reference string
  if (!dataURI.startsWith('data:')) return Promise.resolve(dataURI);
  // SVG data URIs are already small
  if (dataURI.startsWith('data:image/svg+xml')) return Promise.resolve(dataURI);
  // Small enough (<50KB) — pass through
  if (dataURI.length < 50_000) return Promise.resolve(dataURI);
  // Large PNG/other — downscale to 64x64 thumbnail
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
