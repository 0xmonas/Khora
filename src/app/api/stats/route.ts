import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, fallback } from 'viem';
import { shape } from 'wagmi/chains';
import { CHAIN_CONFIG } from '@/types/agent';
import { getV2Address, BOOA_V2_ABI } from '@/lib/contracts/booa-v2';
import { getRedis } from '@/lib/server/redis';
import { generalLimiter, getIP, rateLimitHeaders } from '@/lib/ratelimit';

export const maxDuration = 15;

const VALID_CHAIN_IDS = new Set(
  Object.values(CHAIN_CONFIG).map(c => c.chainId)
);

export async function GET(request: NextRequest) {
  const ip = getIP(request);
  const rl = await generalLimiter.limit(ip);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const filterChainId = request.nextUrl.searchParams.get('chainId');

  try {
    const config = CHAIN_CONFIG['shape'];
    const client = createPublicClient({
      transport: fallback(config.rpcUrls.map((url) => http(url))),
    });

    const booaSupply = await client.readContract({
      address: getV2Address(shape.id),
      abi: BOOA_V2_ABI,
      functionName: 'totalSupply',
    }) as bigint;

    const redis = getRedis();
    let khoraCount = 0;
    try {
      if (filterChainId && VALID_CHAIN_IDS.has(Number(filterChainId))) {
        const keys = await redis.keys(`agent:registry:${filterChainId}:*`);
        khoraCount = keys.length;
      } else {
        const keys = await redis.keys('agent:registry:*');
        khoraCount = keys.length;
      }
    } catch { /* keep 0 */ }

    const mainnetChains = Object.entries(CHAIN_CONFIG)
      .filter(([key]) => key !== 'base-sepolia' && key !== 'shape-sepolia')
      .map(([key, val]) => ({ name: val.name, chainId: val.chainId, slug: key }));

    return NextResponse.json({
      booaMinted: Number(booaSupply),
      agentsRegistered: khoraCount,
      chainsSupported: mainnetChains.length,
      chains: mainnetChains,
      filteredByChain: filterChainId ? Number(filterChainId) : null,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  } catch {
    return NextResponse.json({
      booaMinted: 3333,
      agentsRegistered: 0,
      chainsSupported: 16,
      chains: [],
      filteredByChain: null,
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
    });
  }
}
