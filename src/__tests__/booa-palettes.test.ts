import { describe, it, expect } from 'vitest';
import { BOOA_PALETTES, C64, posterize, recolorSvg, applyBackground } from '@/lib/booa-palettes';

const uniq = (c: string[]) => new Set(c).size;

describe('posterize', () => {
  it('16 (and 0) leave the palette untouched', () => {
    for (const p of BOOA_PALETTES) {
      expect(posterize(p.colors, 16)).toEqual(p.colors);
      expect(posterize(p.colors, 0)).toEqual(p.colors);
    }
  });

  it('2 keeps exactly the darkest and lightest slot colours', () => {
    const out = posterize(C64, 2);
    expect(uniq(out)).toBe(2);
    expect(out[0]).toBe('000000');
    expect(out[4]).toBe('FFFFFF');
    expect(out.every((c) => c === '000000' || c === 'FFFFFF')).toBe(true);
  });

  it('4 and 8 never exceed their tone count', () => {
    for (const p of BOOA_PALETTES) {
      expect(uniq(posterize(p.colors, 4))).toBeLessThanOrEqual(4);
      expect(uniq(posterize(p.colors, 8))).toBeLessThanOrEqual(8);
    }
  });

  it('matches the onchain bucket math on a fixed vector', () => {
    const out = posterize(C64, 4);
    expect(out[0]).toBe('000000');
    expect(out[4]).toBe('FFFFFF');
    expect(out[7]).toBe('000000');
    expect(out[9]).toBe('FFFFFF');
  });

  it('every palette is 16 six-hex colours', () => {
    for (const p of BOOA_PALETTES) {
      expect(p.colors).toHaveLength(16);
      for (const c of p.colors) expect(c).toMatch(/^[0-9A-F]{6}$/);
    }
  });
});

describe('recolorSvg', () => {
  it('swaps every C64 hex for the same slot in the target palette', () => {
    const svg = '<path stroke="#626262"/><rect fill="#000000"/><path stroke="#A057A3"/>';
    const gb = BOOA_PALETTES.find((p) => p.name === 'Game Boy')!.colors;
    const out = recolorSvg(svg, gb);
    expect(out).toContain(`#${gb[1]}`);
    expect(out).toContain(`#${gb[0]}`);
    expect(out).toContain(`#${gb[15]}`);
    expect(out).not.toContain('#626262');
  });
});

describe('applyBackground', () => {
  const ring =
    '<svg><rect fill="#000000" y="-0.5" width="64" height="65"/>' +
    '<path stroke="#9F4E44" d="M10 10h3M10 11h1M12 11h1M10 12h3"/></svg>';

  it('recolours only the outside and keeps enclosed background pixels', () => {
    const out = applyBackground(ring, 'FF0000');
    expect(out).toContain('<rect fill="#FF0000"');
    expect(out).toContain('stroke="#9F4E44"');
    expect(out).toContain('<path stroke="#000000" d="M11 11h1"/>');
  });

  it('transparent drops the rect but keeps the enclosed pixel', () => {
    const out = applyBackground(ring, 'transparent');
    expect(out).not.toContain('<rect');
    expect(out).toContain('d="M11 11h1"');
  });

  it('empty bg is a no-op', () => {
    expect(applyBackground(ring, '')).toBe(ring);
  });
});
