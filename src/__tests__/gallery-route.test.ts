import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const BOOA = '0xbc48fD45aAaf6549293056606397D351a100b222';

async function get(query: string) {
  const { GET } = await import('@/app/api/gallery/route');
  return GET(new NextRequest(`https://booa.app/api/gallery?${query}`));
}

describe('/api/gallery', () => {
  let alchemy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    process.env.ALCHEMY_API_KEY = 'test';
    alchemy = vi.fn(async () => new Response(JSON.stringify({ nfts: [], pageKey: null }), { status: 200 }));
    vi.stubGlobal('fetch', alchemy);
  });

  it.each([
    ['a contract that is not BOOA', 'contract=0x0000000000000000000000000000000000000abc&chain=ethereum'],
    ['an unknown chain', `contract=${BOOA}&chain=base`],
    ['a limit above one page', `contract=${BOOA}&chain=ethereum&limit=1000`],
    ['a limit that is not a number', `contract=${BOOA}&chain=ethereum&limit=50abc`],
    ['a startToken past the collection', `contract=${BOOA}&chain=ethereum&startToken=0x${'f'.repeat(64)}`],
    ['a malformed startToken', `contract=${BOOA}&chain=ethereum&startToken=zz`],
  ])('rejects %s without calling Alchemy', async (_, query) => {
    const res = await get(query);
    expect(res.status).toBe(400);
    expect(alchemy).not.toHaveBeenCalled();
  });

  it('passes a valid BOOA page through once', async () => {
    const res = await get(`contract=${BOOA}&chain=ethereum&limit=50&startToken=0x${'0'.repeat(62)}32`);
    expect(res.status).toBe(200);
    expect(alchemy).toHaveBeenCalledTimes(1);
    const url = new URL(alchemy.mock.calls[0][0] as string);
    expect(url.hostname).toBe('eth-mainnet.g.alchemy.com');
    expect(url.searchParams.get('limit')).toBe('50');
  });
});
