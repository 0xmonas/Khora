// Server-side holder check via on-chain balanceOf with Redis cache.
// Mirrors the pattern in /api/pixel-forge-replicate but exported for reuse.

import { createPublicClient, http } from 'viem';
import { shape } from 'viem/chains';
import { BOOA_V2_ABI, getV2Address } from '@/lib/contracts/booa-v2';
import { getRedis } from '@/lib/server/redis';

const SHAPE_RPC = process.env.NEXT_PUBLIC_SHAPE_RPC_URL || 'https://mainnet.shape.network';
const HOLDER_CACHE_TTL = 300; // 5 min

export async function getHolderBalance(address: string): Promise<number> {
  const redis = getRedis();
  const key = `holder:v2:${address.toLowerCase()}`;
  const cached = await redis.get<number>(key);
  if (cached !== null) return cached;

  try {
    const client = createPublicClient({ transport: http(SHAPE_RPC) });
    const balance = await client.readContract({
      address: getV2Address(shape.id),
      abi: BOOA_V2_ABI,
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    });
    const count = Number(balance);
    await redis.set(key, count, { ex: HOLDER_CACHE_TTL });
    return count;
  } catch {
    return 0;
  }
}

export async function isHolder(address: string): Promise<boolean> {
  return (await getHolderBalance(address)) >= 1;
}
