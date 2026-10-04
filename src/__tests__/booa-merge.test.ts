import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { C64, mergeIsolated, renderGrid, svgToGrid, renderPreview, posterize, BOOA_PALETTES } from '@/lib/booa-palettes';

const grey = Array.from({ length: 16 }, (_, s) => (s * 16).toString(16).padStart(2, '0').repeat(3).toUpperCase());
const blank = (fill = 0) => new Uint8Array(4096).fill(fill);
const at = (x: number, y: number) => y * 64 + x;

describe('mergeIsolated', () => {
  it('an isolated pixel joins its neighbours', () => {
    const g = blank(); g[at(10, 10)] = 5;
    expect(mergeIsolated(g, grey)).toEqual(blank());
  });

  it('a pixel with one matching neighbour stays', () => {
    const g = blank(); g[at(10, 10)] = 5; g[at(11, 10)] = 5;
    const out = mergeIsolated(g, grey);
    expect(out[at(10, 10)]).toBe(5); expect(out[at(11, 10)]).toBe(5);
  });

  it('the majority neighbour wins', () => {
    const g = blank(); g[at(10, 10)] = 5; g[at(10, 9)] = 7; g[at(10, 11)] = 7; g[at(9, 10)] = 7;
    expect(mergeIsolated(g, grey)[at(10, 10)]).toBe(7);
  });

  it('a tie goes to the first neighbour in up, down, left, right order', () => {
    const g = blank(); g[at(10, 10)] = 5; g[at(10, 9)] = 1; g[at(10, 11)] = 2; g[at(9, 10)] = 2; g[at(11, 10)] = 1;
    expect(mergeIsolated(g, grey)[at(10, 10)]).toBe(1);
  });

  it('slots with the same colour count as equal', () => {
    const same = [...grey]; same[2] = same[1];
    const g = blank(); g[at(10, 10)] = 1; g[at(10, 9)] = 2;
    expect(mergeIsolated(g, same)[at(10, 10)]).toBe(1);
  });

  it('is a single pass over the original', () => {
    const g = blank(); g[at(10, 10)] = 5; g[at(11, 10)] = 6;
    const out = mergeIsolated(g, grey);
    expect(out[at(10, 10)]).toBe(0); expect(out[at(11, 10)]).toBe(0);
  });
});

describe('renderer parity', () => {
  const fx = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'merge-fixture.json'), 'utf8')) as { bitmap: string; palette: string; bg: string; svgBase64: string };
  const bytes = Buffer.from(fx.bitmap.slice(2), 'hex');
  const grid = new Uint8Array(4096);
  for (let i = 0; i < 2048; i++) { grid[i * 2] = bytes[i] >> 4; grid[i * 2 + 1] = bytes[i] & 15; }
  const palette = Array.from({ length: 16 }, (_, s) => fx.palette.slice(2 + s * 6, 8 + s * 6).toUpperCase());

  it('merge + render matches the Solidity output byte for byte', () => {
    const expected = Buffer.from(fx.svgBase64, 'base64').toString('utf8');
    expect(renderGrid(mergeIsolated(grid, palette), palette, fx.bg)).toBe(expected);
  });

  it('svgToGrid round-trips a rendered C64 grid', () => {
    const svg = renderGrid(grid, C64, '');
    expect(svgToGrid(svg)).toEqual(grid);
  });

  it('renderPreview leaves the untouched C64 render byte-identical', () => {
    const svg = renderGrid(grid, C64, '');
    expect(renderPreview(svg, C64, '')).toBe(svg);
    expect(renderPreview(svg, posterize(C64, 16), '')).toBe(svg);
  });

  it('every palette renders without throwing and keeps 4096 pixels', () => {
    const svg = renderGrid(grid, C64, '');
    for (const p of BOOA_PALETTES) {
      const out = renderPreview(svg, posterize(p.colors, 4), 'FFFFFF');
      expect(out.startsWith('<svg')).toBe(true);
    }
  });
});
