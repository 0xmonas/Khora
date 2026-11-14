import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

function routes(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) routes(p, out);
    else if (name === 'route.ts') out.push(p);
  }
  return out;
}

describe('per-IP rate limits', () => {
  it('are counted once, by the middleware, not again inside routes', () => {
    const doubled = routes(join(process.cwd(), 'src/app/api')).filter((f) =>
      /\b(generalLimiter|writeLimiter)\.limit\(ip\)/.test(readFileSync(f, 'utf8')),
    );
    expect(doubled).toEqual([]);
  });
});
