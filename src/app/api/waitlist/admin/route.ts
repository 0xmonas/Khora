import { NextRequest, NextResponse } from 'next/server';
import { getRedis } from '@/lib/server/redis';

export const maxDuration = 15;

const WAITLIST_KEY = 'waitlist:addresses';
const WAITLIST_HANDLES_KEY = 'waitlist:handles';
const WAITLIST_TWEETS_KEY = 'waitlist:tweets';
const WAITLIST_META_KEY = 'waitlist:meta';
const ADMIN_SECRET = process.env.WAITLIST_ADMIN_SECRET;

interface WaitlistMeta {
  openedAt: number;
  closesAt: number;
  paused?: boolean;
  remainingMs?: number; // saved when paused
}

function isAuthorized(request: NextRequest): boolean {
  if (!ADMIN_SECRET) return false;
  const auth = request.headers.get('authorization');
  return auth === `Bearer ${ADMIN_SECRET}`;
}

/**
 * GET /api/waitlist/admin — Export all waitlisted addresses
 * Header: Authorization: Bearer <WAITLIST_ADMIN_SECRET>
 */
export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const redis = getRedis();
  const [addresses, handles, tweets, meta] = await Promise.all([
    redis.smembers(WAITLIST_KEY),
    redis.hgetall(WAITLIST_HANDLES_KEY) as Promise<Record<string, string> | null>,
    redis.hgetall(WAITLIST_TWEETS_KEY) as Promise<Record<string, string> | null>,
    redis.get<WaitlistMeta>(WAITLIST_META_KEY),
  ]);

  // Build address → handle mapping
  const handleMap: Record<string, string> = {};
  if (handles) {
    for (const [handle, addr] of Object.entries(handles)) {
      handleMap[addr] = handle;
    }
  }

  const entries = addresses.sort().map((addr) => ({
    address: addr,
    twitter: handleMap[addr] ? `@${handleMap[addr]}` : null,
    tweetUrl: tweets?.[addr] ?? null,
  }));

  return NextResponse.json({
    count: addresses.length,
    addresses: addresses.sort(),
    entries,
    meta: meta ? {
      openedAt: new Date(meta.openedAt).toISOString(),
      closesAt: new Date(meta.closesAt).toISOString(),
      paused: meta.paused ?? false,
      remainingMs: meta.remainingMs ?? null,
    } : null,
  });
}

/**
 * POST /api/waitlist/admin — Manage waitlist lifecycle
 * Header: Authorization: Bearer <WAITLIST_ADMIN_SECRET>
 * Body:
 *   { action: "open", durationHours: 48 }
 *   { action: "close" }
 *   { action: "pause" }
 *   { action: "resume" }
 */
export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const redis = getRedis();
  const { action, durationHours } = await request.json();

  if (action === 'open') {
    const hours = Number(durationHours) || 48;
    const now = Date.now();
    const closesAt = now + hours * 60 * 60 * 1000;

    const meta: WaitlistMeta = { openedAt: now, closesAt };
    await redis.set(WAITLIST_META_KEY, meta);

    return NextResponse.json({
      ok: true,
      openedAt: new Date(now).toISOString(),
      closesAt: new Date(closesAt).toISOString(),
    });
  }

  if (action === 'close') {
    await redis.del(WAITLIST_META_KEY);
    return NextResponse.json({ ok: true, closed: true });
  }

  if (action === 'reset') {
    await Promise.all([
      redis.del(WAITLIST_KEY),
      redis.del(WAITLIST_HANDLES_KEY),
      redis.del(WAITLIST_TWEETS_KEY),
      redis.del(WAITLIST_META_KEY),
    ]);
    return NextResponse.json({ ok: true, reset: true });
  }

  if (action === 'pause') {
    const meta = await redis.get<WaitlistMeta>(WAITLIST_META_KEY);
    if (!meta) {
      return NextResponse.json({ error: 'Waitlist is not open' }, { status: 400 });
    }
    if (meta.paused) {
      return NextResponse.json({ error: 'Waitlist is already paused' }, { status: 400 });
    }

    const now = Date.now();
    const remaining = Math.max(0, meta.closesAt - now);

    const updated: WaitlistMeta = {
      ...meta,
      paused: true,
      remainingMs: remaining,
    };
    await redis.set(WAITLIST_META_KEY, updated);

    return NextResponse.json({
      ok: true,
      paused: true,
      remainingMs: remaining,
      remainingHuman: `${Math.floor(remaining / 3600000)}h ${Math.floor((remaining % 3600000) / 60000)}m`,
    });
  }

  if (action === 'resume') {
    const meta = await redis.get<WaitlistMeta>(WAITLIST_META_KEY);
    if (!meta) {
      return NextResponse.json({ error: 'Waitlist is not open' }, { status: 400 });
    }
    if (!meta.paused) {
      return NextResponse.json({ error: 'Waitlist is not paused' }, { status: 400 });
    }

    const now = Date.now();
    const remaining = meta.remainingMs ?? 0;
    const newClosesAt = now + remaining;

    const updated: WaitlistMeta = {
      openedAt: meta.openedAt,
      closesAt: newClosesAt,
      // paused and remainingMs removed — back to active
    };
    await redis.set(WAITLIST_META_KEY, updated);

    return NextResponse.json({
      ok: true,
      resumed: true,
      closesAt: new Date(newClosesAt).toISOString(),
      remainingMs: remaining,
    });
  }

  return NextResponse.json({ error: 'Invalid action. Use "open", "close", "pause", "resume", or "reset"' }, { status: 400 });
}
