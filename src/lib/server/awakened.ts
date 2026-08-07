// Canonical agentic-data source: reads Adapter8004 bindings straight from chain.
//
// An "awakening" is an AgentBound event on the adapter for the BOOA contract —
// a BOOA that became an onchain ERC-8004 agent. This module is the single place
// every surface (Agent Chat, BOOASK, Wiki, /api/awakened) resolves binding facts
// from, so the numbers never disagree.

import { getAdapterAddress } from '@/lib/contracts/booa-adapter';
import { getV2Address } from '@/lib/contracts/booa-v2';
import { CHAIN_CONFIG } from '@/types/agent';
import { getRedis } from '@/lib/server/redis';

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || '';
const ALCHEMY_NETWORKS: Partial<Record<number, string>> = {
  1: 'eth-mainnet',
  8453: 'base-mainnet',
  360: 'shape-mainnet',
  11011: 'shape-sepolia',
};

function rpcUrlsFor(chainId: number): string[] {
  const cfg = Object.values(CHAIN_CONFIG).find((c) => c.chainId === chainId);
  const urls = cfg ? [...cfg.rpcUrls] : [];
  const net = ALCHEMY_NETWORKS[chainId];
  // Public RPCs cap eth_getLogs ranges; prefer Alchemy where we have coverage.
  if (ALCHEMY_API_KEY && net) return [`https://${net}.g.alchemy.com/v2/${ALCHEMY_API_KEY}`, ...urls];
  return urls;
}

const AGENT_BOUND_EVENT =
  'event AgentBound(uint256 indexed agentId, uint8 indexed standard, address indexed tokenContract, uint256 tokenId, address registeredBy)';

// eth_getLogs page size + a hard page cap so a shared adapter can't blow up cost.
const LOG_PAGE = BigInt(9_999);
const MAX_PAGES = 12;

export interface Awakening {
  agentId: number;
  tokenId: number;
  awakenedBy: string;      // registeredBy from the event
  block: number;
  awakenedAt: number | null; // ms
  txHash: string;
}

async function makeClient(chainId: number) {
  const { createPublicClient, http, fallback } = await import('viem');
  const urls = rpcUrlsFor(chainId);
  if (urls.length === 0) return null;
  return createPublicClient({ transport: fallback(urls.map((u) => http(u))) });
}

/** All AgentBound events for the BOOA contract on `chainId`, newest first. */
/**
 * Cached wrapper around the log scan. Every surface that needs binding facts goes
 * through here, so they cannot disagree and the shared adapter is not rescanned
 * once per caller. `fresh` skips the read (used right after an awaken).
 */
const SCAN_CACHE_KEY = (chainId: number) => `awakened:scan:v1:${chainId}`;
const SCAN_CACHE_TTL = 120;

export async function scanAwakenings(chainId: number, fresh = false): Promise<Awakening[]> {
  if (!fresh) {
    try {
      const cached = await getRedis().get<Awakening[]>(SCAN_CACHE_KEY(chainId));
      if (Array.isArray(cached)) return cached;
    } catch { /* cache unavailable — scan */ }
  }
  const result = await scanAwakeningsUncached(chainId);
  if (result.length > 0) {
    try {
      await getRedis().set(SCAN_CACHE_KEY(chainId), result, { ex: SCAN_CACHE_TTL });
    } catch { /* best effort */ }
  }
  return result;
}

async function scanAwakeningsUncached(chainId: number): Promise<Awakening[]> {
  const adapter = getAdapterAddress(chainId);
  const booa = getV2Address(chainId);
  if (!adapter || !booa || booa.length <= 2) return [];

  const client = await makeClient(chainId);
  if (!client) return [];
  const { parseAbiItem } = await import('viem');
  const event = parseAbiItem(AGENT_BOUND_EVENT);

  const latest = await client.getBlockNumber();
  // AgentBound has a non-indexed tokenId; filter by the indexed tokenContract.
  const raw: { agentId: number; tokenId: number; awakenedBy: string; block: bigint; txHash: string }[] = [];
  let cursor = latest;
  for (let i = 0; i < MAX_PAGES; i++) {
    const from = cursor > LOG_PAGE ? cursor - LOG_PAGE : BigInt(0);
    try {
      const logs = await client.getLogs({
        address: adapter,
        event,
        args: { tokenContract: booa as `0x${string}` },
        fromBlock: from,
        toBlock: cursor,
      });
      for (const l of logs) {
        raw.push({
          agentId: Number(l.args.agentId),
          tokenId: Number(l.args.tokenId),
          awakenedBy: (l.args.registeredBy as string) || '',
          block: l.blockNumber ?? BigInt(0),
          txHash: l.transactionHash ?? '',
        });
      }
    } catch { /* page failed — keep scanning */ }
    if (from === BigInt(0)) break;
    cursor = from - BigInt(1);
  }
  if (raw.length === 0) return [];

  // Dedupe by tokenId keeping the newest binding (handles rebind).
  const newestByToken = new Map<number, (typeof raw)[number]>();
  for (const r of raw) {
    const prev = newestByToken.get(r.tokenId);
    if (!prev || r.block > prev.block) newestByToken.set(r.tokenId, r);
  }
  const unique = Array.from(newestByToken.values()).sort((a, b) => Number(b.block - a.block));

  // Resolve timestamps (bounded set → one getBlock each, tolerated).
  const blocks = await Promise.all(
    unique.map((r) => client.getBlock({ blockNumber: r.block }).catch(() => null)),
  );
  return unique.map((r, i) => ({
    agentId: r.agentId,
    tokenId: r.tokenId,
    awakenedBy: r.awakenedBy,
    block: Number(r.block),
    awakenedAt: blocks[i] ? Number(blocks[i]!.timestamp) * 1000 : null,
    txHash: r.txHash,
  }));
}

/** The current awakening for one BOOA token (newest binding), or null. */
export async function findAwakening(chainId: number, tokenId: number): Promise<Awakening | null> {
  const all = await scanAwakenings(chainId);
  return all.find((a) => a.tokenId === tokenId) ?? null;
}
