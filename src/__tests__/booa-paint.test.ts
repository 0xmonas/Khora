import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderGrid, outsideMask, bgSlot, C64, svgToGrid, renderPreview } from '@/lib/booa-palettes';
import { encodePaint, decodePaint } from '@/lib/contracts/booa-paint';

const fx = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'paint-fixture.json'), 'utf8')) as {
  bitmap: string; palette: string; strokes: string; applied: number; plain: string; filled: string; transparent: string;
};
const bytes = Buffer.from(fx.bitmap.slice(2), 'hex');
const grid = new Uint8Array(4096);
for (let i = 0; i < 2048; i++) { grid[i * 2] = bytes[i] >> 4; grid[i * 2 + 1] = bytes[i] & 15; }
const palette = Array.from({ length: 16 }, (_, s) => fx.palette.slice(2 + s * 6, 8 + s * 6).toUpperCase());
const paint = decodePaint(fx.strokes);
const b64 = (s: string) => Buffer.from(s, 'base64').toString('utf8');

describe('paint encoding', () => {
  it('round-trips and sorts by position', () => {
    const entries = [{ pos: 4095, slot: 15 }, { pos: 0, slot: 1 }, { pos: 70, slot: 3 }];
    expect(decodePaint(encodePaint(entries))).toEqual([{ pos: 0, slot: 1 }, { pos: 70, slot: 3 }, { pos: 4095, slot: 15 }]);
  });

  it('the fixture strokes decode to sorted unique positions', () => {
    for (let i = 1; i < paint.length; i++) expect(paint[i].pos).toBeGreaterThan(paint[i - 1].pos);
  });
});

describe('paint render parity with RendererV4', () => {
  it('without background fill', () => expect(renderGrid(grid, palette, '', paint)).toBe(b64(fx.plain)));
  it('with a colour fill', () => expect(renderGrid(grid, palette, 'FF0000', paint)).toBe(b64(fx.filled)));
  it('with a transparent fill', () => expect(renderGrid(grid, palette, 'transparent', paint)).toBe(b64(fx.transparent)));

  it('only border-reachable background pixels are applied, matching the onchain count', () => {
    const mask = outsideMask(grid, bgSlot(grid));
    const applied = paint.filter((p) => mask[p.pos] && p.slot !== bgSlot(grid)).length;
    expect(applied).toBe(fx.applied);
    expect(applied).toBeLessThan(paint.length);
  });

  it('renderPreview from an OG svg reproduces the same painted output', () => {
    const og = renderGrid(grid, C64, '');
    expect(svgToGrid(og)).toEqual(grid);
    expect(renderPreview(og, palette, 'FF0000', paint)).toBe(b64(fx.filled));
  });
});
