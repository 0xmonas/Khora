// Server-side holder check via on-chain balanceOf with Redis cache.
// Mirrors the pattern in /api/pixel-forge-replicate but exported for reuse.

import { createPublicClient, http } from 'viem';
import { shape } from 'viem/chains';
import {
  BOOA_V2_ABI,
  BOOA_V2_MINTER_ABI,
  getV2Address,
  getV2MinterAddress,
} from '@/lib/contracts/booa-v2';
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

const OWNER_CACHE_KEY = 'booa:v2:owner';
const OWNER_CACHE_TTL = 600; // 10 min

// The op is the on-chain contract owner. Cached so gated reads stay cheap.
export async function getContractOwner(): Promise<string | null> {
  const redis = getRedis();
  const cached = await redis.get<string>(OWNER_CACHE_KEY);
  if (cached) return cached;
  try {
    const client = createPublicClient({ transport: http(SHAPE_RPC) });
    const owner = (await client.readContract({
      address: getV2MinterAddress(shape.id),
      abi: BOOA_V2_MINTER_ABI,
      functionName: 'owner',
    })) as string;
    const lc = owner.toLowerCase();
    await redis.set(OWNER_CACHE_KEY, lc, { ex: OWNER_CACHE_TTL });
    return lc;
  } catch {
    return null;
  }
}

export async function isOp(address: string): Promise<boolean> {
  const owner = await getContractOwner();
  return !!owner && owner === address.toLowerCase();
}
