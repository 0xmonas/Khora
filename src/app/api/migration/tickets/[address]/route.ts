import { NextRequest, NextResponse } from 'next/server';
import { getAddress } from 'viem';
import { buildTickets, migrationConfig } from '@/lib/server/migration';
import { heavyLimiter, getIP, rateLimitHeaders } from '@/lib/ratelimit';

export const maxDuration = 60;
export const runtime = 'nodejs';

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const MAX_BATCH = 200;

/**
 * Issue operator-signed claim tickets for tokens `address` burned on Shape.
 *
 * Public + safe: every ticket is bound to `address` (only that wallet can use
 * it on BOOAEth) and is signed ONLY after an on-chain burn verification. A
 * caller cannot obtain a usable ticket for a token they did not burn.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ address: string }> },
) {
  const cfg = migrationConfig();
  if (!cfg.enabled) {
    return NextResponse.json(
      { error: 'Migration is not live yet.', reason: cfg.reason },
      { status: 503 },
    );
  }

  const { address } = await context.params;
  if (!ADDR_RE.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const ip = getIP(req);
  const rl = await heavyLimiter.limit(`migration:tickets:${ip}`);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait and retry.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const raw = (body as { tokenIds?: unknown })?.tokenIds;
  if (!Array.isArray(raw) || raw.length === 0) {
    return NextResponse.json({ error: 'tokenIds must be a non-empty array' }, { status: 400 });
  }
  if (raw.length > MAX_BATCH) {
    return NextResponse.json({ error: `Max ${MAX_BATCH} tokens per request` }, { status: 400 });
  }

  const seen = new Set<number>();
  const tokenIds: number[] = [];
  for (const v of raw) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0 || n >= 3333) {
      return NextResponse.json({ error: `Invalid tokenId: ${String(v)}` }, { status: 400 });
    }
    if (!seen.has(n)) {
      seen.add(n);
      tokenIds.push(n);
    }
  }

  try {
    const claimer = getAddress(address);
    const tickets = await buildTickets(claimer, tokenIds);
    const ready = tickets.filter((t) => t.status === 'ready').length;
    return NextResponse.json(
      { address: claimer, ready, tickets },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Failed to build tickets' }, { status: 500 });
  }
}
