import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const LIVE = '0x00000000000000000000000000000000000000c4';
const OWNER = '0x00000000000000000000000000000000000000AA';
const UNCLAIMED = 10;

const uri = (personality: string, svg: string) =>
  'data:application/json;base64,' + Buffer.from(JSON.stringify({
    name: 'BOOA #1496',
    image: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'),
    attributes: [
      { trait_type: 'Name', value: 'Ink-Sync' },
      { trait_type: 'Creature', value: 'Cyborg' },
      { trait_type: 'Personality', value: personality },
      { trait_type: 'Skill', value: 'Workflow Automation' },
    ],
  })).toString('base64');

const readContract = vi.fn(async ({ address, functionName, args }: { address: string; functionName: string; args?: bigint[] }) => {
  if (functionName === 'renderer') return LIVE;
  if (functionName === 'tokenURI') return address === LIVE ? uri('Dry-witted', '<svg>live</svg>') : uri('Methodical', '<svg>original</svg>');
  if (functionName === 'ownerOf') {
    if (Number(args?.[0]) === UNCLAIMED) throw new Error('ERC721NonexistentToken');
    return OWNER;
  }
  if (functionName === 'getAgentWallet') return '0x00000000000000000000000000000000000000BB';
  throw new Error(`unexpected ${functionName}`);
});

vi.mock('viem', async (orig) => ({
  ...(await orig<typeof import('viem')>()),
  createPublicClient: () => ({ readContract }),
}));

const store = new Map<string, unknown>();
vi.mock('@/lib/server/redis', () => ({
  getRedis: () => ({
    get: async (k: string) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null),
    set: async (k: string, v: unknown) => { store.set(k, JSON.parse(JSON.stringify(v))); return 'OK'; },
    del: async (...ks: string[]) => { ks.forEach((k) => store.delete(k)); return ks.length; },
  }),
}));

const findAwakening = vi.fn(async () => ({ agentId: 36637, tokenId: 1496, awakenedBy: '0xBA76', block: 1, awakenedAt: 1_784_000_000_000, txHash: '0x' }));
vi.mock('@/lib/server/awakened', () => ({ findAwakening: () => findAwakening() }));

async function json(id: string, query = '') {
  const { GET } = await import('@/app/api/v1/booas/[id]/route');
  return GET(new NextRequest(`https://booa.app/api/v1/booas/${id}${query}`), { params: Promise.resolve({ id }) });
}

async function file(id: string, name: string, query = '') {
  const { GET } = await import('@/app/api/v1/booas/[id]/[file]/route');
  return GET(new NextRequest(`https://booa.app/api/v1/booas/${id}/${name}${query}`), { params: Promise.resolve({ id, file: name }) });
}

describe('/api/v1/booas', () => {
  beforeEach(() => {
    store.clear();
    readContract.mockClear();
    findAwakening.mockClear();
  });

  it('serves the holder-edited identity next to the untouched mint identity', async () => {
    const body = await (await json('1496')).json();
    expect(body.identity.personality).toEqual(['Dry-witted']);
    expect(body.mint.identity.personality).toEqual(['Methodical']);
    expect(body.owner).toBe(OWNER.toLowerCase());
    expect(body.home).toBe('ethereum');
    expect(body.agent.agentId).toBe(36637);
  });

  it('still serves a token that has not been claimed on Ethereum yet', async () => {
    const body = await (await json(String(UNCLAIMED))).json();
    expect(body.owner).toBeNull();
    expect(body.home).toBe('shape');
    expect(body.identity.personality).toEqual(['Dry-witted']);
  });

  it('builds soul.md from the live identity without reading agent data', async () => {
    const res = await file('1496', 'soul.md');
    expect(await res.text()).toContain('Dry-witted');
    expect(findAwakening).not.toHaveBeenCalled();
  });

  it('serves the live art by default and the original art as immutable', async () => {
    const live = await file('1496', 'image.svg');
    expect(await live.text()).toBe('<svg>live</svg>');
    expect(live.headers.get('Cache-Control')).not.toContain('immutable');
    const original = await file('1496', 'image.svg', '?variant=original');
    expect(await original.text()).toBe('<svg>original</svg>');
    expect(original.headers.get('Cache-Control')).toContain('immutable');
  });

  it('rejects unknown ids and params before touching the chain', async () => {
    expect((await json('3333')).status).toBe(404);
    expect((await json('1496', '?x=1')).status).toBe(400);
    expect((await file('1496', 'image.svg', '?variant=evil')).status).toBe(400);
    expect(readContract).not.toHaveBeenCalled();
  });

  it('answers repeat reads from the cache', async () => {
    await json('1496');
    const reads = readContract.mock.calls.length;
    await json('1496');
    expect(readContract.mock.calls.length).toBe(reads);
  });
});
