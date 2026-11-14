import { NextRequest, NextResponse } from 'next/server';
import { CHAIN_CONFIG } from '@/types/agent';
import { getRedis } from '@/lib/server/redis';
import { rejectUnknownParams } from '@/lib/server/query-params';

export const maxDuration = 15;

const VALID_CHAIN_IDS = new Set(
  Object.values(CHAIN_CONFIG).map(c => c.chainId)
);
const MAINNET_CHAINS = Object.entries(CHAIN_CONFIG)
  .filter(([key]) => !key.includes('sepolia') && !key.includes('testnet'))
  .map(([key, val]) => ({ name: val.name, chainId: val.chainId, slug: key }));

export async function GET(request: NextRequest) {
  const badParam = rejectUnknownParams(request.nextUrl.searchParams, ['chainId']);
  if (badParam) return badParam;
  const filterChainId = request.nextUrl.searchParams.get('chainId');
  if (filterChainId !== null && !VALID_CHAIN_IDS.has(Number(filterChainId))) {
    return NextResponse.json({ error: 'Unknown chainId' }, { status: 400 });
  }

  try {
    // Collection is sold out at MAX_SUPPLY. Not a per-chain read: Ethereum's
    // totalSupply reflects migration progress, not the fixed collection size.
    const booaSupply = BigInt(3333);

    const redis = getRedis();
    const chainScope = filterChainId && VALID_CHAIN_IDS.has(Number(filterChainId)) ? filterChainId : null;
    // agentsRegistered = cache keys (lookup-polluted, kept for back-compat).
    // bridgeRegistered = clean count of NFTs registered on 8004 THROUGH our Bridge
    // (marker written only on a verified POST, never on a GET lookup).
    let agentsCount = 0;
    let bridgeCount = 0;
    try {
      const [regKeys, bridgeKeys] = await Promise.all([
        redis.keys(chainScope ? `agent:registry:${chainScope}:*` : 'agent:registry:*'),
        redis.keys(chainScope ? `bridge:registered:${chainScope}:*` : 'bridge:registered:*'),
      ]);
      agentsCount = regKeys.length;
      bridgeCount = bridgeKeys.length;
    } catch { /* keep 0 */ }

    return NextResponse.json({
      booaMinted: Number(booaSupply),
      agentsRegistered: agentsCount,
      bridgeRegistered: bridgeCount,
      chainsSupported: MAINNET_CHAINS.length,
      chains: MAINNET_CHAINS,
      filteredByChain: filterChainId ? Number(filterChainId) : null,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch {
    return NextResponse.json({
      booaMinted: 3333,
      agentsRegistered: 0,
      bridgeRegistered: 0,
      chainsSupported: MAINNET_CHAINS.length,
      chains: MAINNET_CHAINS,
      filteredByChain: null,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  }
}
