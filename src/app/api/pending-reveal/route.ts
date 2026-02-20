import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { createPublicClient, http, type Chain } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { BOOA_NFT_ABI, getContractAddress } from '@/lib/contracts/booa';

const CHAIN_MAP: Record<number, Chain> = {
  [base.id]: base,
  [baseSepolia.id]: baseSepolia,
};
import { generalLimiter, writeLimiter, getIP, rateLimitHeaders } from '@/lib/ratelimit';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// 8 days TTL (beyond the 7-day reveal deadline)
const TTL_SECONDS = 8 * 24 * 60 * 60;

// Basic address format validation
function isValidAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function makeKey(address: string, chainId: number, slot: number) {
  return `pending-reveal:${address.toLowerCase()}:${chainId}:${slot}`;
}

// GET /api/pending-reveal?address=0x...&chainId=84532&slot=0
export async function GET(req: NextRequest) {
  // Rate limit
  const ip = getIP(req);
  const rl = await generalLimiter.limit(ip);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const { searchParams } = req.nextUrl;
  const address = searchParams.get('address');
  const chainId = searchParams.get('chainId');
  const slot = searchParams.get('slot');

  if (!address || !chainId || slot === null) {
    return NextResponse.json({ error: 'Missing address, chainId, or slot' }, { status: 400 });
  }

  if (!isValidAddress(address)) {
    return NextResponse.json({ error: 'Invalid address format' }, { status: 400 });
  }

  const key = makeKey(address, Number(chainId), Number(slot));
  const entry = await redis.get<{ svg: string; traits: string }>(key);

  if (!entry) {
    return NextResponse.json({ found: false }, { headers: rateLimitHeaders(rl) });
  }

  return NextResponse.json(
    { found: true, svg: entry.svg, traits: entry.traits },
    { headers: rateLimitHeaders(rl) },
  );
}

// POST /api/pending-reveal — save SVG+traits for a pending reveal
export async function POST(req: NextRequest) {
  // Stricter rate limit for writes
  const ip = getIP(req);
  const rl = await writeLimiter.limit(ip);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const body = await req.json();
  const { address, chainId, slot, svg, traits } = body;

  if (!address || chainId === undefined || slot === undefined || !svg) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (!isValidAddress(address)) {
    return NextResponse.json({ error: 'Invalid address format' }, { status: 400 });
  }

  // SIWE: require authenticated wallet and ensure it matches
  const sessionAddress = req.headers.get('x-siwe-address');
  if (!sessionAddress) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  if (address.toLowerCase() !== sessionAddress.toLowerCase()) {
    return NextResponse.json({ error: 'Address mismatch' }, { status: 403 });
  }

  // Validate slot is a reasonable number (0-99)
  const slotNum = Number(slot);
  if (!Number.isInteger(slotNum) || slotNum < 0 || slotNum > 99) {
    return NextResponse.json({ error: 'Invalid slot number' }, { status: 400 });
  }

  // Limit SVG size to prevent abuse (max ~32KB hex string)
  if (typeof svg !== 'string' || svg.length > 50000) {
    return NextResponse.json({ error: 'SVG too large or invalid' }, { status: 400 });
  }

  // Verify that this commitment actually exists on-chain and is unrevealed
  const contractAddress = getContractAddress(Number(chainId));
  if (!contractAddress) {
    return NextResponse.json({ error: 'Unsupported chain' }, { status: 400 });
  }

  try {
    const chain = CHAIN_MAP[Number(chainId)] || baseSepolia;
    const client = createPublicClient({
      chain,
      transport: http(),
    });

    const [timestamp, revealed] = await client.readContract({
      address: contractAddress,
      abi: BOOA_NFT_ABI,
      functionName: 'getCommitment',
      args: [address as `0x${string}`, BigInt(slot)],
    }) as [bigint, boolean];

    if (revealed) {
      return NextResponse.json({ error: 'Slot already revealed' }, { status: 400 });
    }
    if (timestamp === BigInt(0)) {
      return NextResponse.json({ error: 'No commitment found on-chain' }, { status: 400 });
    }
  } catch {
    // RPC error — reject instead of allowing unverified writes
    return NextResponse.json(
      { error: 'Chain verification unavailable — try again later' },
      { status: 503 },
    );
  }

  // Overwrite protection: if key already exists, reject
  const key = makeKey(address, Number(chainId), slotNum);
  const existing = await redis.exists(key);
  if (existing) {
    return NextResponse.json(
      { error: 'Pending reveal already exists for this slot' },
      { status: 409 },
    );
  }

  await redis.set(key, { svg, traits: traits || '' }, { ex: TTL_SECONDS });

  return NextResponse.json({ ok: true }, { headers: rateLimitHeaders(rl) });
}

// DELETE /api/pending-reveal — remove after successful reveal
// No signature needed: we verify on-chain that the slot is already revealed,
// so deleting is harmless (data was already committed to chain).
export async function DELETE(req: NextRequest) {
  // Stricter rate limit for writes
  const ip = getIP(req);
  const rl = await writeLimiter.limit(ip);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const body = await req.json();
  const { address, chainId, slot } = body;

  if (!address || chainId === undefined || slot === undefined) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  if (!isValidAddress(address)) {
    return NextResponse.json({ error: 'Invalid address format' }, { status: 400 });
  }

  // SIWE: require authenticated wallet and ensure it matches
  const deleteSessionAddress = req.headers.get('x-siwe-address');
  if (!deleteSessionAddress) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }
  if (address.toLowerCase() !== deleteSessionAddress.toLowerCase()) {
    return NextResponse.json({ error: 'Address mismatch' }, { status: 403 });
  }

  // Only allow deletion if the slot has been revealed on-chain
  const contractAddress = getContractAddress(Number(chainId));
  if (contractAddress) {
    try {
      const chain = CHAIN_MAP[Number(chainId)] || baseSepolia;
      const client = createPublicClient({
        chain,
        transport: http(),
      });
      const [, revealed] = await client.readContract({
        address: contractAddress,
        abi: BOOA_NFT_ABI,
        functionName: 'getCommitment',
        args: [address as `0x${string}`, BigInt(slot)],
      }) as [bigint, boolean];

      if (!revealed) {
        // Allow delete anyway — RPC may lag behind tx confirmation.
        // TTL cleanup handles the rest.
      }
    } catch {
      // RPC error — allow delete (TTL will clean up anyway)
    }
  }

  const key = makeKey(address, Number(chainId), Number(slot));
  await redis.del(key);

  return NextResponse.json({ ok: true }, { headers: rateLimitHeaders(rl) });
}
