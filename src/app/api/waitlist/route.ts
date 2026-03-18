import { NextRequest, NextResponse } from 'next/server';
import { getRedis } from '@/lib/server/redis';
import { verifyTurnstile } from '@/lib/turnstile';
import { createPublicClient, http, formatEther } from 'viem';
import { mainnet, base, shape } from 'viem/chains';

export const maxDuration = 15;

const WAITLIST_KEY = 'waitlist:addresses';
const WAITLIST_HANDLES_KEY = 'waitlist:handles'; // handle → address mapping (unique handles)
const WAITLIST_META_KEY = 'waitlist:meta';
const MIN_BALANCE = BigInt('5000000000000000'); // 0.005 ETH
const MAX_WAITLIST = 1000;

const CHAINS = {
  [mainnet.id]: { chain: mainnet, rpc: undefined },
  [base.id]: { chain: base, rpc: undefined },
  [shape.id]: { chain: shape, rpc: process.env.NEXT_PUBLIC_SHAPE_RPC_URL },
} as const;

/**
 * GET /api/waitlist — Check waitlist status + balance
 * Query: ?address=0x... (optional)
 */
export async function GET(request: NextRequest) {
  const redis = getRedis();
  const address = request.nextUrl.searchParams.get('address')?.toLowerCase();

  const [count, meta] = await Promise.all([
    redis.scard(WAITLIST_KEY),
    redis.get<{ openedAt: number; closesAt: number; paused?: boolean; remainingMs?: number }>(WAITLIST_META_KEY),
  ]);

  const now = Date.now();
  const isFull = count >= MAX_WAITLIST;
  const isOpen = meta ? (now < meta.closesAt && !meta.paused && !isFull) : false;
  const isPaused = meta?.paused ?? false;

  let registered = false;
  let balanceOk = false;
  let balances: Record<string, string> = {};

  if (address) {
    registered = await redis.sismember(WAITLIST_KEY, address) === 1;

    // Check balance on Ethereum, Base, Shape
    const results = await Promise.allSettled(
      Object.entries(CHAINS).map(async ([, config]) => {
        const client = createPublicClient({
          chain: config.chain,
          transport: http(config.rpc),
        });
        return {
          chain: config.chain.name,
          balance: await client.getBalance({ address: address as `0x${string}` }),
        };
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        balances[result.value.chain] = formatEther(result.value.balance);
        if (result.value.balance >= MIN_BALANCE) balanceOk = true;
      }
    }
  }

  return NextResponse.json({
    isOpen,
    isPaused,
    isFull,
    count,
    maxCapacity: MAX_WAITLIST,
    registered,
    closesAt: meta?.closesAt ?? null,
    remainingMs: isPaused ? (meta?.remainingMs ?? null) : null,
    balanceOk,
    balances,
  });
}

/**
 * POST /api/waitlist — Register wallet + Twitter handle
 * Body: { turnstileToken: string, twitterHandle: string }
 * Requires SIWE auth (x-siwe-address header from middleware)
 */
export async function POST(request: NextRequest) {
  try {
    const redis = getRedis();

    // 1. Check waitlist is open and not paused
    const meta = await redis.get<{ openedAt: number; closesAt: number; paused?: boolean }>(WAITLIST_META_KEY);
    const now = Date.now();
    if (!meta || now >= meta.closesAt) {
      return NextResponse.json({ error: 'Waitlist is closed' }, { status: 403 });
    }
    if (meta.paused) {
      return NextResponse.json({ error: 'Waitlist is paused' }, { status: 403 });
    }
    const currentCount = await redis.scard(WAITLIST_KEY);
    if (currentCount >= MAX_WAITLIST) {
      return NextResponse.json({ error: 'Waitlist is full' }, { status: 403 });
    }

    // 2. SIWE auth
    const siweAddress = request.headers.get('x-siwe-address');
    if (!siweAddress) {
      return NextResponse.json({ error: 'Wallet connection required' }, { status: 401 });
    }

    // 3. Parse & validate body
    const body = await request.json();
    const { turnstileToken, twitterHandle } = body;

    if (!turnstileToken || typeof turnstileToken !== 'string') {
      return NextResponse.json({ error: 'Missing captcha token' }, { status: 400 });
    }

    // Validate Twitter handle — must start with @
    if (!twitterHandle || typeof twitterHandle !== 'string') {
      return NextResponse.json({ error: 'Twitter handle is required' }, { status: 400 });
    }
    const trimmed = twitterHandle.trim();
    if (!trimmed.startsWith('@')) {
      return NextResponse.json({ error: 'Twitter handle must start with @' }, { status: 400 });
    }
    const handle = trimmed.slice(1).toLowerCase();
    if (!handle || !/^[a-z0-9_]{1,15}$/.test(handle)) {
      return NextResponse.json({ error: 'Invalid Twitter handle' }, { status: 400 });
    }

    // 4. Verify Turnstile
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || undefined;
    const isHuman = await verifyTurnstile(turnstileToken, ip);
    if (!isHuman) {
      return NextResponse.json({ error: 'Captcha verification failed' }, { status: 403 });
    }

    // 5. Check balance on any supported chain (Ethereum, Base, Shape)
    const addr = siweAddress.toLowerCase() as `0x${string}`;
    let balanceOk = false;

    const balanceChecks = await Promise.allSettled(
      Object.values(CHAINS).map(async (config) => {
        const client = createPublicClient({
          chain: config.chain,
          transport: http(config.rpc),
        });
        return client.getBalance({ address: addr });
      })
    );

    for (const result of balanceChecks) {
      if (result.status === 'fulfilled' && result.value >= MIN_BALANCE) {
        balanceOk = true;
        break;
      }
    }

    if (!balanceOk) {
      return NextResponse.json(
        { error: 'Minimum 0.005 ETH required on Ethereum, Base, or Shape' },
        { status: 403 }
      );
    }

    // 6. Check if Twitter handle already used by another wallet
    const existingAddr = await redis.hget(WAITLIST_HANDLES_KEY, handle);
    if (existingAddr && existingAddr !== addr) {
      return NextResponse.json(
        { error: 'This Twitter handle is already registered with another wallet' },
        { status: 409 }
      );
    }

    // 7. Register address + handle atomically
    const added = await redis.sadd(WAITLIST_KEY, addr);
    await redis.hset(WAITLIST_HANDLES_KEY, { [handle]: addr });

    const newCount = await redis.scard(WAITLIST_KEY);

    return NextResponse.json({
      ok: true,
      alreadyRegistered: added === 0,
      count: newCount,
    });
  } catch (error) {
    console.error('Waitlist registration error:', error);
    return NextResponse.json({ error: 'Registration failed' }, { status: 500 });
  }
}
