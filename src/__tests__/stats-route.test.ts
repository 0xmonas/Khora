import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

const keys = vi.fn(async () => []);
vi.mock('@/lib/server/redis', () => ({ getRedis: () => ({ keys }) }));

async function stats(query = '') {
  const { GET } = await import('@/app/api/stats/route');
  return GET(new NextRequest(`https://booa.app/api/stats${query}`));
}

describe('/api/stats', () => {
  it('counts mainnets only, leaving every testnet out', async () => {
    const body = await (await stats()).json();
    expect(body.chains.some((c: { slug: string }) => /sepolia|testnet/.test(c.slug))).toBe(false);
    expect(body.chainsSupported).toBe(body.chains.length);
  });

  it('rejects unknown chain ids and params before scanning Redis', async () => {
    keys.mockClear();
    expect((await stats('?chainId=999999')).status).toBe(400);
    expect((await stats('?foo=1')).status).toBe(400);
    expect(keys).not.toHaveBeenCalled();
  });
});
