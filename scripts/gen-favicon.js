// Regenerate favicon assets from public/booalogo.svg.
// Run: cd <repo root> && node scripts/gen-favicon.js
//
// Produces:
//   public/icon-16.png            16x16 PNG
//   public/icon-32.png            32x32 PNG
//   public/apple-touch-icon.png   180x180 padded PNG (iOS home screen)
//   public/favicon.ico            multi-size ICO (16+32) for legacy browsers
//
// Requires: sharp (transitively via Next.js). For favicon.ico generation also
// needs png-to-ico — install once with: npm i -g png-to-ico

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SVG = path.join(process.cwd(), 'public/booalogo.svg');
const OUT_DIR = path.join(process.cwd(), 'public');

async function main() {
  const svg = fs.readFileSync(SVG);

  await sharp(svg, { density: 600 })
    .resize(160, 160, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .extend({ top: 10, bottom: 10, left: 10, right: 10, background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .png()
    .toFile(path.join(OUT_DIR, 'apple-touch-icon.png'));

  await sharp(svg, { density: 300 })
    .resize(32, 32, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(OUT_DIR, 'icon-32.png'));

  await sharp(svg, { density: 300 })
    .resize(16, 16, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(path.join(OUT_DIR, 'icon-16.png'));

  try {
    const mod = require('png-to-ico');
    const pngToIco = mod.default || mod;
    const buf = await pngToIco([
      fs.readFileSync(path.join(OUT_DIR, 'icon-16.png')),
      fs.readFileSync(path.join(OUT_DIR, 'icon-32.png')),
    ]);
    fs.writeFileSync(path.join(OUT_DIR, 'favicon.ico'), buf);
    console.log('Wrote favicon.ico (' + buf.length + ' bytes)');
  } catch {
    console.warn('Skipping favicon.ico — png-to-ico not installed. Run: npm i -g png-to-ico');
  }

  console.log('Wrote apple-touch-icon.png, icon-32.png, icon-16.png');
}

main().catch((e) => { console.error(e); process.exit(1); });
