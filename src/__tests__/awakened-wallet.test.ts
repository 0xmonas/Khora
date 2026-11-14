import { describe, it, expect, vi, beforeEach } from 'vitest';

const HOLDER = '0x00000000000000000000000000000000000000a1';
const BUYER = '0x00000000000000000000000000000000000000b2';
const DEPLOY = 25_555_954;

type Log = { blockNumber: bigint; logIndex: number; transactionHash: string; eventName?: string; args: Record<string, unknown> };
let bound: Log[] = [];
let wallet: Log[] = [];
let latest = BigInt(DEPLOY + 20_000);

const getLogs = vi.fn(async (q: { address: string; fromBlock: bigint; toBlock: bigint; events?: unknown[] }) => {
  const inRange = (l: Log) => l.blockNumber >= q.fromBlock && l.blockNumber <= q.toBlock;
  return (q.events ? wallet : bound).filter(inRange);
});

vi.mock('viem', async (orig) => ({
  ...(await orig<typeof import('viem')>()),
  createPublicClient: () => ({
    getBlockNumber: async () => latest,
    getLogs,
    getBlock: async () => ({ timestamp: BigInt(1_784_000_000) }),
  }),
}));

const store = new Map<string, unknown>();
vi.mock('@/lib/server/redis', () => ({
  getRedis: () => ({
    get: async (k: string) => (store.has(k) ? JSON.parse(JSON.stringify(store.get(k))) : null),
    set: async (k: string, v: unknown) => { store.set(k, JSON.parse(JSON.stringify(v))); return 'OK'; },
  }),
}));

const at = (block: number, logIndex = 0) => ({ blockNumber: BigInt(block), logIndex, transactionHash: '0x' });

async function awakening() {
  const { findAwakening } = await import('@/lib/server/awakened');
  return findAwakening(1, 5);
}

describe('awakened index: who set the agent wallet', () => {
  beforeEach(() => {
    vi.resetModules();
    store.clear();
    latest = BigInt(DEPLOY + 20_000);
    bound = [{ ...at(DEPLOY + 10), args: { agentId: BigInt(100), tokenId: BigInt(5), registeredBy: HOLDER } }];
    wallet = [];
  });

  it('records the address that set the agent wallet', async () => {
    wallet = [{ ...at(DEPLOY + 20), eventName: 'AgentWalletSet', args: { agentId: BigInt(100), newWallet: '0xW', updatedBy: HOLDER } }];
    expect((await awakening())?.walletSetBy).toBe(HOLDER.toLowerCase());
  });

  it('keeps the newest setter across scans and clears it on unset', async () => {
    wallet = [{ ...at(DEPLOY + 20), eventName: 'AgentWalletSet', args: { agentId: BigInt(100), newWallet: '0xW', updatedBy: HOLDER } }];
    await awakening();
    latest = BigInt(DEPLOY + 40_000);
    wallet = [...wallet, { ...at(DEPLOY + 30_000), eventName: 'AgentWalletSet', args: { agentId: BigInt(100), newWallet: '0xW2', updatedBy: BUYER } }];
    expect((await awakening())?.walletSetBy).toBe(BUYER.toLowerCase());
    latest = BigInt(DEPLOY + 60_000);
    wallet = [...wallet, { ...at(DEPLOY + 50_000), eventName: 'AgentWalletUnset', args: { agentId: BigInt(100), updatedBy: BUYER } }];
    expect((await awakening())?.walletSetBy).toBeNull();
  });

  it('ignores wallet events of agents that are not BOOAs', async () => {
    wallet = [{ ...at(DEPLOY + 20), eventName: 'AgentWalletSet', args: { agentId: BigInt(999), newWallet: '0xW', updatedBy: BUYER } }];
    expect((await awakening())?.walletSetBy).toBeNull();
  });
});

describe('v1 agent link', () => {
  it('flags a wallet set by someone other than the current holder as stale', async () => {
    const { walletStale } = await import('@/lib/server/booa');
    expect(walletStale({ agentWallet: '0xw', walletSetBy: HOLDER.toLowerCase() }, BUYER.toLowerCase())).toBe(true);
    expect(walletStale({ agentWallet: '0xw', walletSetBy: BUYER.toLowerCase() }, BUYER.toLowerCase())).toBe(false);
    expect(walletStale({ agentWallet: null, walletSetBy: HOLDER.toLowerCase() }, BUYER.toLowerCase())).toBe(false);
  });
});

