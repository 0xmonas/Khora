import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const page = (n: number, start: number, next?: string) => ({
  ownedNfts: Array.from({ length: n }, (_, i) => ({
    contract: { address: '0xbc48fD45aAaf6549293056606397D351a100b222', name: 'BOOA' },
    tokenId: String(start + i),
    raw: { metadata: {} },
    image: {},
  })),
  pageKey: next,
});

describe('/api/fetch-nfts paging', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ALCHEMY_API_KEY = 'test';
  });

  it('returns every token of a single contract, not just the first page', async () => {
    const calls: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (u: string) => {
      calls.push(u);
      const key = new URL(u).searchParams.get('pageKey');
      const body = !key ? page(100, 0, 'p2') : page(9, 100);
      return new Response(JSON.stringify(body), { status: 200 });
    }));
    const { GET } = await import('@/app/api/fetch-nfts/route');
    const res = await GET(new NextRequest('https://booa.app/api/fetch-nfts?address=0x0000000000000000000000000000000000000001&chain=ethereum&contract=0xbc48fD45aAaf6549293056606397D351a100b222'));
    const json = await res.json();
    expect(json.nfts).toHaveLength(109);
    expect(json.pageKey).toBeNull();
    expect(calls).toHaveLength(2);
  });

  it('keeps one page per call for the unfiltered wallet view', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(page(50, 0, 'next')), { status: 200 })));
    const { GET } = await import('@/app/api/fetch-nfts/route');
    const res = await GET(new NextRequest('https://booa.app/api/fetch-nfts?address=0x0000000000000000000000000000000000000001&chain=ethereum'));
    const json = await res.json();
    expect(json.nfts).toHaveLength(50);
    expect(json.pageKey).toBe('next');
  });
});
