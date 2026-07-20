import { NextRequest, NextResponse } from 'next/server';
import { getAddress } from 'viem';
import { findBurnedUnclaimed } from '@/lib/server/migration';
import { generalLimiter, getIP, rateLimitHeaders } from '@/lib/ratelimit';

export const maxDuration = 60;

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * Recovery endpoint: tokens `address` already burned on Shape but has NOT yet
 * claimed on Ethereum. Lets the UI offer a claim-only resume when a burn
 * succeeded but the claim tx never landed (wallet timeout, reload). On-chain read.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ address: string }> },
) {
  const ip = getIP(req);
  const rl = await generalLimiter.limit(ip);
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const { address } = await context.params;
  if (!ADDR_RE.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  try {
    const tokenIds = await findBurnedUnclaimed(getAddress(address));
    return NextResponse.json(
      { address, count: tokenIds.length, tokenIds },
      { headers: { 'Cache-Control': 'private, max-age=15', ...rateLimitHeaders(rl) } },
    );
  } catch {
    return NextResponse.json({ error: 'Failed to scan burns' }, { status: 500 });
  }
}
