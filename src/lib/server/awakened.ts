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

// eth_getLogs page size + a per-call page cap. The index is cumulative and persisted,
// so a long-idle instance catches up over successive calls instead of one huge scan.
const LOG_PAGE = BigInt(9_999);
const CATCHUP_PAGES = 30;

// First block that could contain an awakening per chain (the BOOA token contract's
// deploy block). Scanning forward from here — rather than a fixed window back from
// head — is what stops early awakenings from silently dropping off the list.
const DEPLOY_BLOCK: Partial<Record<number, bigint>> = {
  1: BigInt(25_555_954), // BOOA ETH contract deploy
};
// Chains without a known deploy block seed from a window back and accumulate forward.
const SEED_SPAN = BigInt(120_000);
// Skip re-scanning when the index is caught up and was refreshed this recently.
const FRESH_WINDOW_MS = 60_000;
const HEAD_SLACK = BigInt(5);

export interface Awakening {
  agentId: number;
  tokenId: number;
  awakenedBy: string;      // registeredBy from the event
  block: number;
  awakenedAt: number | null; // ms
  txHash: string;
}

interface AwakenedIndex {
  agents: Awakening[];
  cursor: number;   // last block scanned (inclusive)
  updatedAt: number; // ms
}

async function makeClient(chainId: number) {
  const { createPublicClient, http, fallback } = await import('viem');
  const urls = rpcUrlsFor(chainId);
  if (urls.length === 0) return null;
  return createPublicClient({ transport: fallback(urls.map((u) => http(u))) });
}

/**
 * Cumulative, persisted index of every AgentBound event for the BOOA contract on
 * `chainId`, newest first. Every surface that needs binding facts goes through here,
 * so they cannot disagree. The index scans FORWARD from the token contract's deploy
 * block and never forgets an old binding — an early awakening can't drop off a
 * fixed head-window the way it did before. Each call only scans blocks past the
 * stored cursor (bounded per call), so cost stays low once caught up. `fresh` forces
 * a delta scan even when the index was refreshed within FRESH_WINDOW_MS.
 */
const INDEX_KEY = (chainId: number) => `awakened:index:v1:${chainId}`;

export async function scanAwakenings(chainId: number, fresh = false): Promise<Awakening[]> {
  const adapter = getAdapterAddress(chainId);
  const booa = getV2Address(chainId);
  if (!adapter || !booa || booa.length <= 2) return [];

  const client = await makeClient(chainId);
  if (!client) return [];

  let index: AwakenedIndex | null = null;
  try {
    index = await getRedis().get<AwakenedIndex>(INDEX_KEY(chainId));
  } catch { /* index unavailable — rebuild from deploy block */ }

  const latest = await client.getBlockNumber();
  const caughtUp = index !== null && BigInt(index.cursor) >= latest - HEAD_SLACK;
  if (index && !fresh && caughtUp && Date.now() - index.updatedAt < FRESH_WINDOW_MS) {
    return index.agents;
  }

  const floor = DEPLOY_BLOCK[chainId] ?? (latest > SEED_SPAN ? latest - SEED_SPAN : BigInt(0));
  const fromBlock = index ? BigInt(index.cursor) + BigInt(1) : floor;
  if (fromBlock > latest) {
    return index?.agents ?? [];
  }

  const { parseAbiItem } = await import('viem');
  const event = parseAbiItem(AGENT_BOUND_EVENT);

  // AgentBound has a non-indexed tokenId; filter by the indexed tokenContract.
  const fresh_raw: { agentId: number; tokenId: number; awakenedBy: string; block: bigint; txHash: string }[] = [];
  let cursor = fromBlock;
  let scannedTo = index ? BigInt(index.cursor) : floor - BigInt(1);
  for (let i = 0; i < CATCHUP_PAGES && cursor <= latest; i++) {
    const to = cursor + LOG_PAGE > latest ? latest : cursor + LOG_PAGE;
    try {
      const logs = await client.getLogs({
        address: adapter,
        event,
        args: { tokenContract: booa as `0x${string}` },
        fromBlock: cursor,
        toBlock: to,
      });
      for (const l of logs) {
        fresh_raw.push({
          agentId: Number(l.args.agentId),
          tokenId: Number(l.args.tokenId),
          awakenedBy: (l.args.registeredBy as string) || '',
          block: l.blockNumber ?? BigInt(0),
          txHash: l.transactionHash ?? '',
        });
      }
      scannedTo = to;
    } catch {
      // Page failed — stop advancing here so the next call retries this range
      // rather than skipping past unscanned blocks and losing their events.
      break;
    }
    cursor = to + BigInt(1);
  }

  // Resolve timestamps for the newly-seen blocks only.
  const blocks = await Promise.all(
    fresh_raw.map((r) => client.getBlock({ blockNumber: r.block }).catch(() => null)),
  );
  const newEvents: Awakening[] = fresh_raw.map((r, i) => ({
    agentId: r.agentId,
    tokenId: r.tokenId,
    awakenedBy: r.awakenedBy,
    block: Number(r.block),
    awakenedAt: blocks[i] ? Number(blocks[i]!.timestamp) * 1000 : null,
    txHash: r.txHash,
  }));

  // Merge into the cumulative set, deduped by tokenId keeping the newest binding.
  const newestByToken = new Map<number, Awakening>();
  for (const a of index?.agents ?? []) newestByToken.set(a.tokenId, a);
  for (const a of newEvents) {
    const prev = newestByToken.get(a.tokenId);
    if (!prev || a.block > prev.block) newestByToken.set(a.tokenId, a);
  }
  const merged = Array.from(newestByToken.values()).sort((a, b) => b.block - a.block);

  const next: AwakenedIndex = { agents: merged, cursor: Number(scannedTo), updatedAt: Date.now() };
  try {
    await getRedis().set(INDEX_KEY(chainId), next);
  } catch { /* best effort — next call re-scans the same delta */ }

  return merged;
}

/** The current awakening for one BOOA token (newest binding), or null. */
export async function findAwakening(chainId: number, tokenId: number): Promise<Awakening | null> {
  const all = await scanAwakenings(chainId);
  return all.find((a) => a.tokenId === tokenId) ?? null;
}
