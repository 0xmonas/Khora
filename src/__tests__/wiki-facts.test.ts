import { describe, it, expect, vi, beforeEach } from 'vitest';

process.env.ALCHEMY_API_KEY = 'test';
process.env.NEXT_PUBLIC_BOOA_CONFIG_ADDRESS = '0x12F02647aBB0E0779D5a8d9AF21b4885ae13cf7F';

const TOKEN = 1496;
const BOOA = '0xbc48fD45aAaf6549293056606397D351a100b222';
const HOLDER = '0x0000000000000000000000000000000000000001';
const BUYER = '0x0000000000000000000000000000000000000002';
const KEY = `wiki:v1:${TOKEN}`;

const store = new Map<string, unknown>();
vi.mock('@/lib/server/redis', () => ({
  getRedis: () => ({
    get: async (k: string) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null),
    set: async (k: string, v: unknown, opts?: { nx?: boolean }) => {
      if (opts?.nx && store.has(k)) return null;
      store.set(k, JSON.parse(JSON.stringify(v)));
      return 'OK';
    },
    mget: async (...ks: string[]) => ks.map(() => null),
    incr: async (k: string) => { const n = Number(store.get(k) ?? 0) + 1; store.set(k, n); return n; },
    expire: async () => 1,
  }),
}));

const generateContent = vi.fn(async (_req: { contents: string }) => ({ text: 'An entry.' }));
vi.mock('@/lib/server/gemini', () => ({ getAI: () => ({ models: { generateContent } }) }));

const chain = { owner: HOLDER, configFails: false, configActive: true };
const getConfig = vi.fn();
const config = {
  palette: 1, levels: 4, bg: 0, agentId: 0, keep: 0, vibe: 'neon',
  personality: [], boundaries: [], skills: [], domains: [],
};
vi.mock('viem', async (orig) => ({
  ...(await orig<typeof import('viem')>()),
  createPublicClient: () => ({
    readContract: async ({ functionName }: { functionName: string }) => {
      if (functionName === 'ownerOf') return chain.owner;
      if (functionName === 'bindingOf') return { standard: 0, tokenContract: BOOA, tokenId: BigInt(TOKEN) };
      if (functionName === 'getConfig') {
        getConfig();
        if (chain.configFails) throw new Error('rpc');
        return [config, chain.configActive];
      }
      throw new Error(`unexpected ${functionName}`);
    },
    getBlockNumber: async () => BigInt(30_000_000),
    getLogs: async () => [],
    getBlock: async () => ({ timestamp: BigInt(1_780_000_000) }),
  }),
}));

const awakening = { agentId: 36637, tokenId: TOKEN, awakenedBy: HOLDER, block: 25_560_843, awakenedAt: 1_784_000_000_000, txHash: '0x' };
const findAwakening = vi.fn(async (): Promise<typeof awakening | null> => awakening);
vi.mock('@/lib/server/awakened', () => ({ findAwakening: () => findAwakening() }));

type Doc = { updatedAt: number; facts: { owner: string; binding: { agentId: number } | null; config: unknown } };
const doc = () => store.get(KEY) as Doc;
const expire = () => store.set(KEY, { ...doc(), updatedAt: 0 });

async function wiki() {
  const { getWiki } = await import('@/lib/server/wiki');
  return getWiki(TOKEN);
}

describe('wiki facts', () => {
  beforeEach(() => {
    store.clear();
    generateContent.mockReset();
    generateContent.mockResolvedValue({ text: 'An entry.' });
    getConfig.mockReset();
    findAwakening.mockReset();
    findAwakening.mockResolvedValue(awakening);
    Object.assign(chain, { owner: HOLDER, configFails: false, configActive: true });
  });

  it('keeps an awakening that is older than any recent block window', async () => {
    await wiki();
    expect(doc().facts.binding?.agentId).toBe(36637);
  });

  it('keeps facts current when no chronicle entry can be written', async () => {
    await wiki();
    expire();
    chain.owner = BUYER;
    generateContent.mockRejectedValue(new Error('gemini down'));
    const res = await wiki();
    expect(doc().facts.owner).toBe(BUYER);
    expect(res?.meta.owner).toBe(BUYER);
  });

  it('does not chronicle a failed read as a released binding or a reset config', async () => {
    await wiki();
    expire();
    findAwakening.mockRejectedValue(new Error('rpc'));
    chain.configFails = true;
    await wiki();
    const prompts = generateContent.mock.calls.map(([req]) => req.contents).join('\n');
    expect(prompts).not.toMatch(/Binding released|restored the original/);
    expect(doc().facts.binding?.agentId).toBe(36637);
    expect(doc().facts.config).not.toBeNull();
  });

  it('refreshes a token once when requests arrive together', async () => {
    await wiki();
    expire();
    getConfig.mockClear();
    await Promise.all([wiki(), wiki()]);
    expect(getConfig).toHaveBeenCalledTimes(1);
  });
});
