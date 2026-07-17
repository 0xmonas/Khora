import { NextRequest, NextResponse } from 'next/server';
import { getShapeBooaAddress } from '@/lib/contracts/booa-eth';

export const maxDuration = 30;

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;

/**
 * List the Shape BOOA token ids currently owned by `address`.
 * These are the tokens still eligible to be burned + migrated. Burned tokens
 * disappear from this list automatically (Alchemy stops returning them).
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ address: string }> },
) {
  const { address } = await context.params;
  if (!ADDR_RE.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  const shapeBooa = getShapeBooaAddress();
  if (!shapeBooa) {
    return NextResponse.json({ error: 'Shape BOOA not configured' }, { status: 500 });
  }

  const key = process.env.ALCHEMY_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'NFT indexer not configured' }, { status: 500 });
  }

  try {
    const tokenIds: number[] = [];
    let pageKey: string | undefined;
    let guard = 0;

    do {
      const url = new URL(`https://shape-mainnet.g.alchemy.com/nft/v3/${key}/getNFTsForOwner`);
      url.searchParams.set('owner', address);
      url.searchParams.append('contractAddresses[]', shapeBooa);
      url.searchParams.set('withMetadata', 'false');
      url.searchParams.set('pageSize', '100');
      if (pageKey) url.searchParams.set('pageKey', pageKey);

      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) {
        return NextResponse.json({ error: 'Indexer request failed' }, { status: 502 });
      }
      const data = await res.json();
      for (const nft of data.ownedNfts ?? []) {
        const id = Number(nft.tokenId);
        if (Number.isInteger(id) && id >= 0 && id < 3333) tokenIds.push(id);
      }
      pageKey = data.pageKey;
      guard++;
    } while (pageKey && guard < 40);

    tokenIds.sort((a, b) => a - b);
    return NextResponse.json(
      { address, count: tokenIds.length, tokenIds },
      { headers: { 'Cache-Control': 'private, max-age=15' } },
    );
  } catch {
    return NextResponse.json({ error: 'Failed to fetch holdings' }, { status: 500 });
  }
}
