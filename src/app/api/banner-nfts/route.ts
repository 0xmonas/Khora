import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || '';

// BOOA contract addresses to filter
const BOOA_CONTRACTS = [
  process.env.NEXT_PUBLIC_BOOA_V2_ADDRESS,
  process.env.NEXT_PUBLIC_BOOA_V2_ADDRESS_TESTNET,
  process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS,
  process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS_TESTNET,
].filter(Boolean).map(a => a!.toLowerCase());

const CHAIN_TO_NETWORK: Record<string, string> = {
  shape: 'shape-mainnet',
  'shape-sepolia': 'shape-sepolia',
};

export interface BannerNft {
  tokenId: string;
  name: string;
  svg: string;
  imageUrl: string;
}

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');
  const chain = request.nextUrl.searchParams.get('chain') || 'shape-sepolia';

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }
  if (!ALCHEMY_API_KEY) {
    return NextResponse.json({ error: 'Alchemy not configured' }, { status: 500 });
  }

  const network = CHAIN_TO_NETWORK[chain];
  if (!network) {
    return NextResponse.json({ error: `Unsupported chain: ${chain}` }, { status: 400 });
  }

  try {
    const url = new URL(`https://${network}.g.alchemy.com/nft/v3/${ALCHEMY_API_KEY}/getNFTsForOwner`);
    url.searchParams.set('owner', address);
    url.searchParams.set('withMetadata', 'true');
    url.searchParams.set('pageSize', '100');

    // Filter to BOOA contracts only
    for (const contract of BOOA_CONTRACTS) {
      url.searchParams.append('contractAddresses[]', contract);
    }

    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch from Alchemy' }, { status: 502 });
    }

    const data = await res.json();

    const nfts: BannerNft[] = (data.ownedNfts || []).map((nft: Record<string, unknown>) => {
      const raw = nft.raw as Record<string, unknown> || {};
      const metadata = raw.metadata as Record<string, unknown> || {};
      const image = nft.image as Record<string, unknown> || {};
      const metadataImage = (metadata.image as string) || '';

      let svg = '';
      if (metadataImage.startsWith('data:image/svg+xml;base64,')) {
        try { svg = atob(metadataImage.replace('data:image/svg+xml;base64,', '')); } catch { /* */ }
      }

      const imageUrl = (image.cachedUrl as string) || (image.thumbnailUrl as string) || metadataImage || '';

      return {
        tokenId: (nft.tokenId as string) || '0',
        name: (nft.name as string) || (metadata.name as string) || `Agent #${nft.tokenId}`,
        svg,
        imageUrl,
      };
    });

    return NextResponse.json({ nfts, totalCount: nfts.length }, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  } catch (error) {
    console.error('banner-nfts error:', error);
    return NextResponse.json({ error: 'Failed to fetch NFTs' }, { status: 500 });
  }
}
