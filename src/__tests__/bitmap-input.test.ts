import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { encodeBitmapServer, isSupportedRaster, pixelateImageWithAspect } from '@/lib/server/bitmap';

const solid = { create: { width: 8, height: 8, channels: 3, background: '#336699' } } as const;
const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8"/></svg>');

describe('bitmap input formats', () => {
  it('accepts PNG, JPEG and WebP by their bytes', async () => {
    for (const buf of [
      await sharp(solid).png().toBuffer(),
      await sharp(solid).jpeg().toBuffer(),
      await sharp(solid).webp().toBuffer(),
    ]) expect(isSupportedRaster(buf)).toBe(true);
  });

  it('rejects SVG, GIF, short and empty input', async () => {
    const xml = Buffer.concat([Buffer.from('<?xml version="1.0"?>\n'), svg]);
    const gif = await sharp(solid).gif().toBuffer();
    for (const buf of [svg, xml, gif, Buffer.from('RIFF'), Buffer.alloc(0)]) {
      expect(isSupportedRaster(buf)).toBe(false);
    }
  });

  it('never hands an SVG to sharp, whatever the data URI claims', async () => {
    const uri = `data:image/png;base64,${svg.toString('base64')}`;
    await expect(encodeBitmapServer(uri)).rejects.toThrow('Unsupported image format');
    await expect(pixelateImageWithAspect(uri)).rejects.toThrow('Unsupported image format');
  });

  it('still encodes a real PNG to 2,048 bytes', async () => {
    const png = await sharp(solid).png().toBuffer();
    expect((await encodeBitmapServer(`data:image/png;base64,${png.toString('base64')}`)).length).toBe(2048);
  });
});
