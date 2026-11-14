import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server/redis', () => ({
  getRedis: () => ({ get: vi.fn(async () => null), set: vi.fn(async () => 'OK') }),
}));

const OWNER = '0x0000000000000000000000000000000000000001';

describe('getAgentsByOwner', () => {
  beforeEach(() => vi.resetModules());

  it('reports an unreachable 8004scan as unknown so callers fall back to the chain', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('network'); }));
    const { getAgentsByOwner } = await import('@/lib/server/eight004scan');
    expect(await getAgentsByOwner(OWNER)).toBeNull();
  });

  it('reports an ignored owner filter as unknown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [], total: 50_000 }), { status: 200 })));
    const { getAgentsByOwner } = await import('@/lib/server/eight004scan');
    expect(await getAgentsByOwner(OWNER)).toBeNull();
  });

  it('still returns an empty list when the owner truly has no agents', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ items: [], total: 0 }), { status: 200 })));
    const { getAgentsByOwner } = await import('@/lib/server/eight004scan');
    expect(await getAgentsByOwner(OWNER)).toEqual([]);
  });
});
