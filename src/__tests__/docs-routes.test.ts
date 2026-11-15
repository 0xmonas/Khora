import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = process.cwd();
const apiDir = join(root, 'src/app/api');

const DOCS = [
  'AGENTS.md',
  'CLAUDE.md',
  'FLOW.md',
  'README.md',
  'SECURITY.md',
  'public/llms.txt',
  'public/skills/SKILL.md',
  'public/skills/references/wallet-setup.md',
  'public/agent-defense.md',
  'src/app/docs/content.ts',
  'src/lib/booask/llm.ts',
];

function routes(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return routes(p);
    return e.name === 'route.ts' ? ['/' + relative(join(root, 'src/app'), dir).split(sep).join('/')] : [];
  });
}

const ROUTES = routes(apiDir);
const PATTERNS = ROUTES.map((r) => new RegExp('^' + r
  .replace(/\/\[\[\.\.\.[^\]]+\]\]/g, '(/.*)?')
  .replace(/\/\[\.\.\.[^\]]+\]/g, '/.+')
  .replace(/\/\[[^\]]+\]/g, '/[^/]+') + '/?$'));

function mentions(text: string): string[] {
  return [...text.matchAll(/\/api\/[A-Za-z0-9_\-[\]{}.:/<>…]+/g)].map((m) => m[0]
    .replace(/[.,:;)`/[]+$/, '')
    .replace(/\{[^}]+\}|<[^>]+>|\[[^\]]+\]|…/g, 'X'));
}

function known(path: string): boolean {
  return PATTERNS.some((rx) => rx.test(path)) || ROUTES.some((r) => r.startsWith(path + '/'));
}

describe('docs only point at API routes that exist', () => {
  it('finds the routes', () => {
    expect(ROUTES).toContain('/api/v1/booas/[id]');
  });

  for (const doc of DOCS) {
    it(doc, () => {
      const unknown = mentions(readFileSync(join(root, doc), 'utf8')).filter((m) => !known(m));
      expect(unknown).toEqual([]);
    });
  }
});
