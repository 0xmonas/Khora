import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || '';

/**
 * GET /api/gallery/owned?contract=0x...&chain=shape&owner=0x...
 *
 * Fetches NFTs owned by a specific address via Alchemy getNFTsForOwner.
 * Used by the "mine" filter in Gallery to show accurate ownership
 * without requiring all pages to be loaded first.
 */
export async function GET(request: NextRequest) {
  const contract = request.nextUrl.searchParams.get('contract');
  const chain = request.nextUrl.searchParams.get('chain') || 'shape';
  const owner = request.nextUrl.searchParams.get('owner');

  if (!contract || !/^0x[a-fA-F0-9]{40}$/.test(contract)) {
    return NextResponse.json({ error: 'Invalid contract address' }, { status: 400 });
  }
  if (!owner || !/^0x[a-fA-F0-9]{40}$/.test(owner)) {
    return NextResponse.json({ error: 'Invalid owner address' }, { status: 400 });
  }
  if (!ALCHEMY_API_KEY) {
    return NextResponse.json({ error: 'Alchemy API key not configured' }, { status: 500 });
  }

  const network = chain === 'shape' ? 'shape-mainnet' : 'shape-sepolia';

  try {
    const url = new URL(
      `https://${network}.g.alchemy.com/nft/v3/${ALCHEMY_API_KEY}/getNFTsForOwner`
    );
    url.searchParams.set('owner', owner);
    url.searchParams.set('contractAddresses[]', contract);
    url.searchParams.set('withMetadata', 'true');
    url.searchParams.set('pageSize', '100');

    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Ownership data temporarily unavailable' },
        { status: 502 },
      );
    }

    const data = await res.json();

    interface AlchemyOwnedNFT {
      tokenId?: string;
      name?: string;
      raw?: { metadata?: { image?: string; attributes?: { trait_type: string; value: string }[] } };
      image?: { cachedUrl?: string; thumbnailUrl?: string; originalUrl?: string };
    }

    const tokens = (data.ownedNfts || []).map((nft: AlchemyOwnedNFT) => {
      const tokenId = nft.tokenId || '0';
      const raw = nft.raw || {};
      const metadata = raw.metadata || {};
      const image = nft.image || {};

      let svg: string | null = null;
      const metadataImage = metadata.image || '';

      if (metadataImage.startsWith('data:image/svg+xml;base64,')) {
        try {
          svg = atob(metadataImage.replace('data:image/svg+xml;base64,', ''));
        } catch { /* ignore */ }
      }

      const imageUrl = image.cachedUrl || image.thumbnailUrl || image.originalUrl || metadataImage || '';

      const name = nft.name || metadata.attributes?.find((a: { trait_type: string; value: string }) => a.trait_type === 'Name')?.value || `#${tokenId}`;
      return { tokenId, svg, imageUrl, name };
    });

    return NextResponse.json({ tokens }, {
      headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch owned tokens' }, { status: 500 });
  }
}
