import { NextRequest, NextResponse } from 'next/server';
import { scanAwakenings } from '@/lib/server/awakened';
import { getAdapterAddress } from '@/lib/contracts/booa-adapter';
import { getV2Address } from '@/lib/contracts/booa-v2';
import { CHAIN_CONFIG } from '@/types/agent';
import { getRedis } from '@/lib/server/redis';
import { generalLimiter, getIP, rateLimitHeaders } from '@/lib/ratelimit';

export const maxDuration = 60;

const ETH_MAINNET = 1;
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as `0x${string}`;
const CACHE_KEY = (chainId: number) => `awakened:v1:${chainId}`;
const CACHE_TTL = 120; // seconds

const OWNER_OF_ABI = [
  { type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }] },
] as const;
const GET_AGENT_WALLET_ABI = [
  { type: 'function', name: 'getAgentWallet', stateMutability: 'view', inputs: [{ name: 'agentId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }] },
] as const;
const ZERO = '0x0000000000000000000000000000000000000000';

/**
 * Collection-wide agentic view: every BOOA that has been Awakened (bound to an
 * ERC-8004 agent via Adapter8004), with holder + who awakened it + when + whether
 * a runtime wallet is linked. Reads purely on-chain (AgentBound + ownerOf +
 * getAgentWallet); cached in Redis so the shared adapter isn't rescanned per hit.
 */
export async function GET(req: NextRequest) {
  const ip = getIP(req);
  const rl = await generalLimiter.limit(ip);
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const chainId = Number(req.nextUrl.searchParams.get('chainId') || ETH_MAINNET);
  if (!Number.isInteger(chainId) || !Object.values(CHAIN_CONFIG).some((c) => c.chainId === chainId)) {
    return NextResponse.json({ error: 'Invalid chainId' }, { status: 400 });
  }

  const redis = getRedis();
  try {
    const cached = await redis.get<unknown>(CACHE_KEY(chainId));
    if (cached) {
      return NextResponse.json(cached, { headers: { 'Cache-Control': 'public, s-maxage=120', ...rateLimitHeaders(rl) } });
    }
  } catch { /* cache miss */ }

  try {
    const events = await scanAwakenings(chainId);
    const adapter = getAdapterAddress(chainId);
    const booa = getV2Address(chainId);

    let enriched = events.map((e) => ({
      tokenId: e.tokenId,
      agentId: e.agentId,
      holder: null as string | null,
      walletLinked: false,
      awakenedBy: e.awakenedBy.toLowerCase(),
      awakenedAt: e.awakenedAt,
      txHash: e.txHash,
    }));

    if (events.length > 0 && adapter && booa && booa.length > 2) {
      const { createPublicClient, http, fallback } = await import('viem');
      const cfg = Object.values(CHAIN_CONFIG).find((c) => c.chainId === chainId)!;
      const key = process.env.ALCHEMY_API_KEY;
      const net = chainId === 1 ? 'eth-mainnet' : chainId === 8453 ? 'base-mainnet' : chainId === 360 ? 'shape-mainnet' : null;
      const urls = key && net ? [`https://${net}.g.alchemy.com/v2/${key}`, ...cfg.rpcUrls] : cfg.rpcUrls;
      const client = createPublicClient({ transport: fallback(urls.map((u) => http(u))) });

      const owners = await client.multicall({
        contracts: events.map((e) => ({ address: booa, abi: OWNER_OF_ABI, functionName: 'ownerOf' as const, args: [BigInt(e.tokenId)] })),
        multicallAddress: MULTICALL3, allowFailure: true,
      });
      const wallets = await client.multicall({
        contracts: events.map((e) => ({ address: adapter, abi: GET_AGENT_WALLET_ABI, functionName: 'getAgentWallet' as const, args: [BigInt(e.agentId)] })),
        multicallAddress: MULTICALL3, allowFailure: true,
      });

      enriched = enriched.map((row, i) => {
        const o = owners[i] as { status: string; result?: string };
        const w = wallets[i] as { status: string; result?: string };
        return {
          ...row,
          holder: o.status === 'success' && o.result ? (o.result as string).toLowerCase() : null,
          walletLinked: w.status === 'success' && !!w.result && (w.result as string).toLowerCase() !== ZERO,
        };
      });
    }

    const payload = { chainId, count: enriched.length, agents: enriched };
    try { await redis.set(CACHE_KEY(chainId), payload, { ex: CACHE_TTL }); } catch { /* non-fatal */ }

    return NextResponse.json(payload, { headers: { 'Cache-Control': 'public, s-maxage=120', ...rateLimitHeaders(rl) } });
  } catch {
    return NextResponse.json({ error: 'Failed to scan awakenings' }, { status: 502 });
  }
}
