import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || '';

/**
 * GET /api/gallery?contract=0x...&chain=base-sepolia
 *
 * Fetches all NFTs in a collection via Alchemy getNFTsForContract.
 * Returns tokenId, SVG image, name, and owner for each token.
 * This avoids the heavy on-chain Multicall3 tokenURI batch that overwhelms RPCs.
 */
export async function GET(request: NextRequest) {
  const contract = request.nextUrl.searchParams.get('contract');
  const chain = request.nextUrl.searchParams.get('chain') || 'base-sepolia';
  const startToken = request.nextUrl.searchParams.get('startToken') || undefined;

  if (!contract || !/^0x[a-fA-F0-9]{40}$/.test(contract)) {
    return NextResponse.json({ error: 'Invalid contract address' }, { status: 400 });
  }

  if (!ALCHEMY_API_KEY) {
    return NextResponse.json({ error: 'Alchemy API key not configured' }, { status: 500 });
  }

  const network = chain === 'base' ? 'base-mainnet' : 'base-sepolia';

  try {
    const url = new URL(
      `https://${network}.g.alchemy.com/nft/v3/${ALCHEMY_API_KEY}/getNFTsForContract`
    );
    url.searchParams.set('contractAddress', contract);
    url.searchParams.set('withMetadata', 'true');
    url.searchParams.set('limit', '100');
    if (startToken) url.searchParams.set('startToken', startToken);

    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Alchemy API error: ${res.status} ${text.slice(0, 200)}` },
        { status: 502 },
      );
    }

    const data = await res.json();

    interface AlchemyNFT {
      tokenId?: string;
      raw?: { metadata?: { image?: string; attributes?: { trait_type: string; value: string }[] } };
      image?: { cachedUrl?: string; thumbnailUrl?: string; originalUrl?: string };
      name?: string;
      description?: string;
      owners?: string[];
    }

    const tokens = (data.nfts || []).map((nft: AlchemyNFT) => {
      const tokenId = nft.tokenId || '0';
      const raw = nft.raw || {};
      const metadata = raw.metadata || {};
      const image = nft.image || {};

      // For BOOA V2: the on-chain tokenURI returns base64 JSON with an SVG image inside.
      // Alchemy caches this — try to get the SVG from raw metadata first.
      let svg: string | null = null;
      const metadataImage = metadata.image || '';

      // The on-chain image is data:image/svg+xml;base64,...
      if (metadataImage.startsWith('data:image/svg+xml;base64,')) {
        try {
          svg = atob(metadataImage.replace('data:image/svg+xml;base64,', ''));
        } catch { /* ignore */ }
      }

      // Fallback: Alchemy may cache a URL version
      const imageUrl = image.cachedUrl || image.thumbnailUrl || image.originalUrl || metadataImage || '';

      return {
        tokenId,
        svg,
        imageUrl,
        name: nft.name || metadata.attributes?.find((a: { trait_type: string; value: string }) => a.trait_type === 'Name')?.value || `#${tokenId}`,
      };
    });

    return NextResponse.json({
      tokens,
      totalCount: tokens.length,
      nextToken: data.pageKey || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch gallery';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
