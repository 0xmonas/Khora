import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { C64 } from '@/lib/booa-palettes';

const page = readFileSync(join(process.cwd(), 'src/app/studio/page.tsx'), 'utf8');
const internal = [...page.matchAll(/href: '(\/[^']*)',\s*media: '([^']+)'/g)].map((m) => m[2]);

describe('studio app logos', () => {
  it('every BOOA app has a pixel-art SVG logo on disk', () => {
    expect(internal.length).toBeGreaterThanOrEqual(17);
    for (const media of internal) {
      expect(media.endsWith('.svg')).toBe(true);
      expect(existsSync(join(process.cwd(), 'public/studio', media))).toBe(true);
    }
  });

  it('logos use only the C64 palette', () => {
    const allowed = new Set(C64.map((c) => c.toLowerCase()));
    for (const media of internal) {
      const svg = readFileSync(join(process.cwd(), 'public/studio', media), 'utf8');
      const colors = [...svg.matchAll(/fill="#([0-9a-fA-F]{6})"/g)].map((m) => m[1].toLowerCase());
      expect(colors.length).toBeGreaterThan(1);
      expect(colors.filter((c) => !allowed.has(c))).toEqual([]);
    }
  });
});
