import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { generalLimiter, writeLimiter, getIP, rateLimitHeaders, resetGenerationQuota } from '@/lib/ratelimit';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

function isValidAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function makeKey(chainId: number, tokenId: number) {
  return `agent:metadata:${chainId}:${tokenId}`;
}

// GET /api/agent-metadata?chainId=84532&tokenId=1&address=0x...
// Only the minter (token owner) can retrieve full metadata
export async function GET(req: NextRequest) {
  const ip = getIP(req);
  const rl = await generalLimiter.limit(ip);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const { searchParams } = req.nextUrl;
  const chainId = searchParams.get('chainId');
  const tokenId = searchParams.get('tokenId');
  const address = searchParams.get('address');

  if (!chainId || tokenId === null || !address) {
    return NextResponse.json({ error: 'Missing chainId, tokenId, or address' }, { status: 400 });
  }

  if (!isValidAddress(address)) {
    return NextResponse.json({ error: 'Invalid address format' }, { status: 400 });
  }

  const key = makeKey(Number(chainId), Number(tokenId));
  const entry = await redis.get<Record<string, unknown>>(key);

  if (!entry) {
    return NextResponse.json({ found: false }, { headers: rateLimitHeaders(rl) });
  }

  // Only the minter can access the full metadata
  const minter = (entry._minter as string) || '';
  if (minter && address.toLowerCase() !== minter.toLowerCase()) {
    return NextResponse.json({ found: false }, { headers: rateLimitHeaders(rl) });
  }

  return NextResponse.json(
    { found: true, metadata: entry },
    { headers: rateLimitHeaders(rl) },
  );
}

// POST /api/agent-metadata — save full agent metadata (permanent, no TTL)
export async function POST(req: NextRequest) {
  const ip = getIP(req);
  const rl = await writeLimiter.limit(ip);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const body = await req.json();
  const { address, chainId, tokenId, agent } = body;

  if (!address || chainId === undefined || tokenId === undefined || !agent) {
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

  const tokenIdNum = Number(tokenId);
  if (!Number.isInteger(tokenIdNum) || tokenIdNum < 0) {
    return NextResponse.json({ error: 'Invalid tokenId' }, { status: 400 });
  }

  // Size check: agent JSON should be reasonable (max 500KB)
  const serialized = JSON.stringify(agent);
  if (serialized.length > 500_000) {
    return NextResponse.json({ error: 'Agent metadata too large' }, { status: 400 });
  }

  // Overwrite protection: only allow first write per tokenId
  const key = makeKey(Number(chainId), tokenIdNum);
  const existing = await redis.exists(key);
  if (existing) {
    return NextResponse.json(
      { error: 'Metadata already exists for this token' },
      { status: 409 },
    );
  }

  // Store permanently (no TTL)
  await redis.set(key, {
    ...agent,
    _minter: address.toLowerCase(),
    _chainId: Number(chainId),
    _tokenId: tokenIdNum,
    _savedAt: Date.now(),
  });

  // Reset generation quota after successful mint — wallet can generate again
  await resetGenerationQuota(address);

  return NextResponse.json({ ok: true }, { headers: rateLimitHeaders(rl) });
}
