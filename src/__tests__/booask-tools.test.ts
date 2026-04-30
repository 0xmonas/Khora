import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { buildTools } from '@/lib/booask/tools';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost:3000/api/booask', {
    method: 'POST',
    headers: { host: 'localhost:3000', 'x-forwarded-proto': 'http' },
  });
}

describe('searchBooaDocs', () => {
  it('returns empty results for empty query', async () => {
    const { executors } = buildTools(makeRequest());
    const r = await executors.searchBooaDocs({ query: '' });
    expect(r).toEqual({ error: 'Empty query' });
  });

  it('returns results scored by token frequency', async () => {
    const { executors } = buildTools(makeRequest());
    const r = (await executors.searchBooaDocs({ query: 'BOOA' })) as {
      results: { title: string; score: number }[];
    };
    expect(Array.isArray(r.results)).toBe(true);
    expect(r.results.length).toBeGreaterThan(0);
    for (let i = 1; i < r.results.length; i++) {
      expect(r.results[i - 1].score).toBeGreaterThanOrEqual(r.results[i].score);
    }
  });

  it('respects maxResults', async () => {
    const { executors } = buildTools(makeRequest());
    const r = (await executors.searchBooaDocs({ query: 'agent', maxResults: 2 })) as {
      results: unknown[];
    };
    expect(r.results.length).toBeLessThanOrEqual(2);
  });

  it('clamps maxResults to 10', async () => {
    const { executors } = buildTools(makeRequest());
    const r = (await executors.searchBooaDocs({ query: 'BOOA', maxResults: 999 })) as {
      results: unknown[];
    };
    expect(r.results.length).toBeLessThanOrEqual(10);
  });

  it('finds ERC-8004 explanation', async () => {
    const { executors } = buildTools(makeRequest());
    const r = (await executors.searchBooaDocs({ query: 'erc-8004 8004 identity registry' })) as {
      results: { title: string; snippet: string }[];
    };
    expect(r.results.length).toBeGreaterThan(0);
  });

  it('snippet includes a hit area', async () => {
    const { executors } = buildTools(makeRequest());
    const r = (await executors.searchBooaDocs({ query: 'pixel forge' })) as {
      results: { snippet: string }[];
    };
    if (r.results.length > 0) {
      expect(r.results[0].snippet.length).toBeGreaterThan(0);
    }
  });

  it('ignores 1-char tokens', async () => {
    const { executors } = buildTools(makeRequest());
    const r = (await executors.searchBooaDocs({ query: 'a' })) as { results: unknown[] };
    expect(r.results).toEqual([]);
  });

  it('indexes blog posts (finds OpenClaw guide)', async () => {
    const { executors } = buildTools(makeRequest());
    const r = (await executors.searchBooaDocs({ query: 'openclaw railway' })) as {
      results: { source: string; title: string }[];
    };
    expect(r.results.length).toBeGreaterThan(0);
    expect(r.results.some((x) => x.source === 'blog')).toBe(true);
  });

  it('indexes SKILL.md (finds agent setup manifest)', async () => {
    const { executors } = buildTools(makeRequest());
    const r = (await executors.searchBooaDocs({ query: 'SKILL.md agent setup manifest' })) as {
      results: { source: string }[];
    };
    expect(r.results.some((x) => x.source === 'skill')).toBe(true);
  });

  it('indexes agent-defense.md (finds defense spec)', async () => {
    const { executors } = buildTools(makeRequest());
    const r = (await executors.searchBooaDocs({ query: 'invariants threat model defense' })) as {
      results: { source: string }[];
    };
    expect(r.results.some((x) => x.source === 'agent-defense')).toBe(true);
  });

  it('indexes Privacy Policy (finds data collection info)', async () => {
    const { executors } = buildTools(makeRequest());
    const r = (await executors.searchBooaDocs({ query: 'private keys never collect data' })) as {
      results: { source: string }[];
    };
    expect(r.results.some((x) => x.source === 'privacy')).toBe(true);
  });

  it('indexes Terms of Service (finds liability + eligibility)', async () => {
    const { executors } = buildTools(makeRequest());
    const r = (await executors.searchBooaDocs({ query: 'eligibility liability indemnification' })) as {
      results: { source: string }[];
    };
    expect(r.results.some((x) => x.source === 'terms')).toBe(true);
  });
});

describe('getAgentByToken — input validation', () => {
  it('rejects negative tokenId', async () => {
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getAgentByToken({ tokenId: -1 })) as { error?: string };
    expect(r.error).toBeDefined();
  });

  it('rejects tokenId above 3332', async () => {
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getAgentByToken({ tokenId: 5000 })) as { error?: string };
    expect(r.error).toBeDefined();
  });

  it('rejects non-integer tokenId', async () => {
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getAgentByToken({ tokenId: 'abc' })) as { error?: string };
    expect(r.error).toBeDefined();
  });

  it('rejects non-integer chainId', async () => {
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getAgentByToken({ tokenId: 1, chainId: 'abc' })) as { error?: string };
    expect(r.error).toBeDefined();
  });

  it('coerces numeric strings', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        verified: true,
        currentNftOwner: '0xabc',
        registrations: [{ agentId: 100, agentRegistry: 'eip155:360:0x8004...' }],
        name: 'TestAgent',
      }),
    });
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getAgentByToken({ tokenId: '312', chainId: '360' })) as {
      found?: boolean;
    };
    expect(r.found).toBe(true);
  });

  it('handles 404 from internal API gracefully', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({ error: 'Agent not found' }),
    });
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getAgentByToken({ tokenId: 312 })) as {
      found: boolean;
    };
    expect(r.found).toBe(false);
  });

  it('returns error on non-OK non-404 response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Internal' }),
    });
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getAgentByToken({ tokenId: 312 })) as { error?: string };
    expect(r.error).toContain('500');
  });

  it('handles fetch network error', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getAgentByToken({ tokenId: 312 })) as { error?: string };
    expect(r.error).toBeDefined();
  });

  it('passes through verified flag and metadata fields', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        verified: false,
        currentNftOwner: '0xowner',
        registeredBy: '0xreg',
        registrations: [{ agentId: 1242, agentRegistry: 'eip155:360:0xreg' }],
        name: 'Foo',
        description: 'Bar',
        services: [{ skills: ['art', 'chat'], domains: ['games'] }],
      }),
    });
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getAgentByToken({ tokenId: 312 })) as Record<string, unknown>;
    expect(r.verified).toBe(false);
    expect(r.currentNftOwner).toBe('0xowner');
    expect(r.agentId).toBe(1242);
    expect(r.name).toBe('Foo');
    expect(r.description).toBe('Bar');
    expect(r.skills).toEqual(['art', 'chat']);
    expect(r.domains).toEqual(['games']);
  });

  it('uses default chainId 360 when not provided', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ verified: true, registrations: [{ agentId: 1 }] }),
    });
    const { executors } = buildTools(makeRequest());
    await executors.getAgentByToken({ tokenId: 100 });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('/api/agent-registry/360/100');
  });
});

describe('tool defs registry', () => {
  it('exposes all tools with required parameters', () => {
    const { defs } = buildTools(makeRequest());
    expect(defs.length).toBe(8);
    const names = defs.map((d) => d.name);
    expect(names).toContain('getAgentByToken');
    expect(names).toContain('getBooaTraits');
    expect(names).toContain('getReputation');
    expect(names).toContain('getCollectionStats');
    expect(names).toContain('getOpenSeaListing');
    expect(names).toContain('getRecentSales');
    expect(names).toContain('getHolderBooas');
    expect(names).toContain('searchBooaDocs');
    const agentTool = defs.find((d) => d.name === 'getAgentByToken');
    expect(agentTool?.parameters.required).toContain('tokenId');
    const traitsTool = defs.find((d) => d.name === 'getBooaTraits');
    expect(traitsTool?.parameters.required).toContain('tokenId');
    const repTool = defs.find((d) => d.name === 'getReputation');
    expect(repTool?.parameters.required).toContain('agentId');
    const listingTool = defs.find((d) => d.name === 'getOpenSeaListing');
    expect(listingTool?.parameters.required).toContain('tokenId');
    const holderTool = defs.find((d) => d.name === 'getHolderBooas');
    expect(holderTool?.parameters.required).toContain('address');
    const docsTool = defs.find((d) => d.name === 'searchBooaDocs');
    expect(docsTool?.parameters.required).toContain('query');
  });
});

describe('getHolderBooas — input validation + scope', () => {
  const prev = process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS;
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS = '0x7aecA981734d133d3f695937508C48483BA6b654';
  });
  afterEach(() => {
    if (prev) process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS = prev;
    else delete process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS;
  });

  it('rejects invalid address format', async () => {
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getHolderBooas({ address: 'not-an-address' })) as { error?: string };
    expect(r.error).toContain('Invalid wallet address');
  });

  it('rejects too-short hex address', async () => {
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getHolderBooas({ address: '0x1234' })) as { error?: string };
    expect(r.error).toBeDefined();
  });

  it('returns ownsBOOA: false for wallet with no BOOAs', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ nfts: [], totalCount: 0, pageKey: null }),
    });
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getHolderBooas({
      address: '0x0000000000000000000000000000000000000001',
    })) as Record<string, unknown>;
    expect(r.ownsBOOA).toBe(false);
    expect(r.count).toBe(0);
    expect(r.tokenIds).toEqual([]);
  });

  it('returns sorted tokenIds + preview when wallet holds BOOAs', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        nfts: [
          { tokenId: '312', contractAddress: '0xabc' },
          { tokenId: '45', contractAddress: '0xabc' },
          { tokenId: '2030', contractAddress: '0xabc' },
        ],
        totalCount: 3,
        pageKey: null,
      }),
    });
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getHolderBooas({
      address: '0xAbCDef0123456789aBCdEF0123456789aBcdEf01',
    })) as Record<string, unknown>;
    expect(r.ownsBOOA).toBe(true);
    expect(r.count).toBe(3);
    expect(r.tokenIds).toEqual([45, 312, 2030]);
    expect(Array.isArray(r.preview)).toBe(true);
    expect((r.preview as unknown[]).length).toBe(3);
  });

  it('locks query to BOOA contract (passes contract param to fetch-nfts)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ nfts: [], totalCount: 0 }),
    });
    const { executors } = buildTools(makeRequest());
    await executors.getHolderBooas({ address: '0x0000000000000000000000000000000000000001' });
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('chain=shape');
    expect(url).toContain('contract=');
  });
});

describe('getCollectionStats — data extraction', () => {
  const prev = process.env.OPENSEA_API_KEY;
  beforeEach(() => { process.env.OPENSEA_API_KEY = 'test-os-key'; });
  afterEach(() => { if (prev) process.env.OPENSEA_API_KEY = prev; else delete process.env.OPENSEA_API_KEY; });

  it('exposes total stats and 24h/7d/30d intervals', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        total: {
          floor_price: 0.05,
          floor_price_symbol: 'ETH',
          volume: 123.45,
          sales: 678,
          num_owners: 1234,
          market_cap: 99.9,
          average_price: 0.18,
        },
        intervals: [
          { interval: 'one_day', volume: 1.2, volume_change: 0.15, sales: 5, average_price: 0.24 },
          { interval: 'seven_day', volume: 8.7, volume_change: -0.05, sales: 30, average_price: 0.29 },
          { interval: 'thirty_day', volume: 40, volume_change: 0.4, sales: 130, average_price: 0.30 },
        ],
      }),
    });
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getCollectionStats({})) as Record<string, unknown>;
    expect(r.floorPriceEth).toBe(0.05);
    expect(r.totalVolume).toBe(123.45);
    expect(r.numOwners).toBe(1234);
    const oneDay = r.oneDay as Record<string, unknown>;
    expect(oneDay.volume).toBe(1.2);
    expect(oneDay.volumeChange).toBe(0.15);
    expect(oneDay.sales).toBe(5);
    const sevenDay = r.sevenDay as Record<string, unknown>;
    expect(sevenDay.volume).toBe(8.7);
    const thirtyDay = r.thirtyDay as Record<string, unknown>;
    expect(thirtyDay.sales).toBe(130);
  });

  it('returns null intervals when missing from response', async () => {
    fetchMock.mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ total: { floor_price: 0.1 }, intervals: [] }),
    });
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getCollectionStats({})) as Record<string, unknown>;
    expect(r.oneDay).toBeNull();
    expect(r.sevenDay).toBeNull();
  });
});

describe('OpenSea tools — missing API key', () => {
  const prev = process.env.OPENSEA_API_KEY;
  beforeEach(() => { delete process.env.OPENSEA_API_KEY; });
  afterEach(() => { if (prev) process.env.OPENSEA_API_KEY = prev; });

  it('getCollectionStats returns error without key', async () => {
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getCollectionStats({})) as { error?: string };
    expect(r.error).toContain('OpenSea');
  });

  it('getOpenSeaListing returns error without key', async () => {
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getOpenSeaListing({ tokenId: 312 })) as { error?: string };
    expect(r.error).toContain('OpenSea');
  });

  it('getRecentSales returns error without key', async () => {
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getRecentSales({})) as { error?: string };
    expect(r.error).toContain('OpenSea');
  });
});

describe('getReputation — input validation', () => {
  it('rejects negative agentId', async () => {
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getReputation({ agentId: -1 })) as { error?: string };
    expect(r.error).toBeDefined();
  });

  it('rejects non-integer agentId', async () => {
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getReputation({ agentId: 'abc' })) as { error?: string };
    expect(r.error).toBeDefined();
  });
});

describe('getAgentByToken — services field extraction', () => {
  it('flattens skills + domains from services[0]', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        verified: true,
        active: true,
        currentNftOwner: '0xowner',
        registrations: [{ agentId: 64 }],
        name: 'Vandal-09',
        description: 'Street-level operative',
        services: [{
          name: 'OASF',
          endpoint: 'https://example.com/agent',
          skills: ['images_computer_vision/image_generation', 'security_privacy/threat_detection'],
          domains: ['technology/blockchain'],
        }],
      }),
    });
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getAgentByToken({ tokenId: 64 })) as Record<string, unknown>;
    expect(r.skills).toEqual([
      'images_computer_vision/image_generation',
      'security_privacy/threat_detection',
    ]);
    expect(r.domains).toEqual(['technology/blockchain']);
    expect(r.serviceEndpoint).toBe('https://example.com/agent');
  });

  it('returns empty arrays when services missing', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ verified: false, registrations: [{ agentId: 1 }], name: 'X' }),
    });
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getAgentByToken({ tokenId: 1 })) as Record<string, unknown>;
    expect(r.skills).toEqual([]);
    expect(r.domains).toEqual([]);
  });

  it('strips image field from response (never sent to LLM)', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        verified: true,
        registrations: [{ agentId: 1 }],
        image: 'data:image/png;base64,' + 'A'.repeat(50000),
      }),
    });
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getAgentByToken({ tokenId: 1 })) as Record<string, unknown>;
    expect(r.image).toBeUndefined();
    expect(JSON.stringify(r).length).toBeLessThan(2000);
  });
});

describe('getBooaTraits', () => {
  it('returns attributes array', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        tokenId: 312,
        name: 'GLOW-FIX',
        description: 'A sentient street-marketing agent',
        attributes: [
          { trait_type: 'Background', value: 'Neon Alley' },
          { trait_type: 'Creature', value: 'Robot' },
        ],
      }),
    });
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getBooaTraits({ tokenId: 312 })) as Record<string, unknown>;
    expect(r.found).toBe(true);
    expect(Array.isArray(r.attributes)).toBe(true);
    expect((r.attributes as unknown[]).length).toBe(2);
  });

  it('rejects invalid tokenId', async () => {
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getBooaTraits({ tokenId: 9999 })) as { error?: string };
    expect(r.error).toBeDefined();
  });

  it('handles 404 from booa-token gracefully', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });
    const { executors } = buildTools(makeRequest());
    const r = (await executors.getBooaTraits({ tokenId: 100 })) as { found: boolean };
    expect(r.found).toBe(false);
  });
});
