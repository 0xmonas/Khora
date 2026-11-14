import { describe, it, expect, vi, beforeEach } from 'vitest';

const HOLDER = '0x0000000000000000000000000000000000000001';
const OTHER = '0x0000000000000000000000000000000000000002';
const SHAPE_BOOA = '0x00000000000000000000000000000000000000a1';
const HELPER = '0x00000000000000000000000000000000000000b1';
const ZERO = '0x0000000000000000000000000000000000000000';

type Log = { address: string; blockNumber: bigint; args: Record<string, unknown> };
const logs: Log[] = [
  { address: HELPER, blockNumber: BigInt(500), args: { holder: HOLDER, tokenId: BigInt(5) } },
  { address: SHAPE_BOOA, blockNumber: BigInt(15_000), args: { from: HOLDER, to: ZERO, tokenId: BigInt(9) } },
  { address: SHAPE_BOOA, blockNumber: BigInt(16_000), args: { from: HOLDER, to: OTHER, tokenId: BigInt(11) } },
  { address: HELPER, blockNumber: BigInt(21_000), args: { holder: OTHER, tokenId: BigInt(12) } },
];

let latest = BigInt(25_000);
let failFrom: bigint | null = null;
const getLogs = vi.fn(async ({ address, fromBlock, toBlock }: { address: string; fromBlock: bigint; toBlock: bigint }) => {
  if (failFrom !== null && fromBlock === failFrom) throw new Error('rpc');
  return logs.filter((l) => l.address === address && l.blockNumber >= fromBlock && l.blockNumber <= toBlock);
});

vi.mock('viem', async (orig) => ({
  ...(await orig<typeof import('viem')>()),
  createPublicClient: () => ({
    getBlockNumber: async () => latest,
    getLogs,
    readContract: async () => false,
  }),
}));

const store = new Map<string, unknown>();
vi.mock('@/lib/server/redis', () => ({
  getRedis: () => ({
    get: async (k: string) => store.get(k) ?? null,
    set: async (k: string, v: unknown) => { store.set(k, JSON.parse(JSON.stringify(v))); return 'OK'; },
  }),
}));

async function pending() {
  const { findBurnedUnclaimed } = await import('@/lib/server/migration');
  return findBurnedUnclaimed(HOLDER);
}

describe('findBurnedUnclaimed', () => {
  beforeEach(() => {
    vi.resetModules();
    store.clear();
    getLogs.mockClear();
    latest = BigInt(25_000);
    failFrom = null;
    process.env.NEXT_PUBLIC_BOOA_V2_ADDRESS = SHAPE_BOOA;
    process.env.NEXT_PUBLIC_BOOA_BURN_HELPER_ADDRESS = HELPER;
    process.env.MIGRATION_BURN_FLOOR_BLOCK = '0';
  });

  it('finds direct burns as well as BurnHelper burns, and ignores sales', async () => {
    expect(await pending()).toEqual({ tokenIds: [5, 9], complete: true });
  });

  it('reports a failed page as incomplete and picks it up on the next call', async () => {
    failFrom = BigInt(10_000);
    expect(await pending()).toEqual({ tokenIds: [5], complete: false });
    failFrom = null;
    expect(await pending()).toEqual({ tokenIds: [5, 9], complete: true });
  });

  it('only scans new blocks once the index has caught up', async () => {
    await pending();
    getLogs.mockClear();
    latest = BigInt(25_100);
    await pending();
    expect(getLogs.mock.calls.every(([q]) => q.fromBlock > BigInt(25_000))).toBe(true);
    expect(getLogs).toHaveBeenCalled();
  });
});
