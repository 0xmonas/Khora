import { NextRequest, NextResponse } from 'next/server';
import { getAddress } from 'viem';
import { findBurnedUnclaimed } from '@/lib/server/migration';

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
  const { address } = await context.params;
  if (!ADDR_RE.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  try {
    const { tokenIds, complete } = await findBurnedUnclaimed(getAddress(address));
    return NextResponse.json(
      { address, count: tokenIds.length, tokenIds, complete },
      { headers: { 'Cache-Control': complete ? 'private, max-age=15' : 'no-store' } },
    );
  } catch {
    return NextResponse.json({ error: 'Failed to scan burns' }, { status: 500 });
  }
}
