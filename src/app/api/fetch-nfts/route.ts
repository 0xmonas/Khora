import { NextRequest, NextResponse } from 'next/server';
import { IDENTITY_REGISTRY_MAINNET, IDENTITY_REGISTRY_TESTNET } from '@/lib/contracts/identity-registry';

export const maxDuration = 30;

const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY || '';

// ERC-8004 Identity Registry contracts — these are ERC-721 but should not appear as "NFTs"
const FILTERED_CONTRACTS = new Set(
  [IDENTITY_REGISTRY_MAINNET, IDENTITY_REGISTRY_TESTNET].map(a => a.toLowerCase())
);

// Alchemy network slugs
const CHAIN_TO_NETWORK: Record<string, string> = {
  base: 'base-mainnet',
  'base-sepolia': 'base-sepolia',
  ethereum: 'eth-mainnet',
  polygon: 'polygon-mainnet',
  arbitrum: 'arb-mainnet',
};

const CHAIN_IDS: Record<string, number> = {
  base: 8453,
  'base-sepolia': 84532,
  ethereum: 1,
  polygon: 137,
  arbitrum: 42161,
};

export interface NFTItem {
  contractAddress: string;
  tokenId: string;
  name: string;
  description: string;
  image: string;
  collection: string;
  tokenType: 'ERC721' | 'ERC1155';
  chain: string;
  chainId: number;
  raw: {
    attributes?: { trait_type: string; value: string }[];
    external_url?: string;
  };
}

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');
  const chain = request.nextUrl.searchParams.get('chain') || 'base';
  const pageKey = request.nextUrl.searchParams.get('pageKey') || undefined;

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }

  if (!ALCHEMY_API_KEY) {
    return NextResponse.json({ error: 'Alchemy API key not configured' }, { status: 500 });
  }

  const network = CHAIN_TO_NETWORK[chain];
  if (!network) {
    return NextResponse.json({ error: `Unsupported chain: ${chain}` }, { status: 400 });
  }

  const chainId = CHAIN_IDS[chain] || 0;

  try {
    const url = new URL(`https://${network}.g.alchemy.com/nft/v3/${ALCHEMY_API_KEY}/getNFTsForOwner`);
    url.searchParams.set('owner', address);
    url.searchParams.set('withMetadata', 'true');
    url.searchParams.set('pageSize', '50');
    if (pageKey) url.searchParams.set('pageKey', pageKey);

    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const text = await res.text();
      return NextResponse.json(
        { error: `Alchemy API error: ${res.status} ${text.slice(0, 200)}` },
        { status: 502 },
      );
    }

    const data = await res.json();

    const nfts: NFTItem[] = (data.ownedNfts || []).map((nft: Record<string, unknown>) => {
      const contract = nft.contract as Record<string, unknown> || {};
      const raw = nft.raw as Record<string, unknown> || {};
      const metadata = raw.metadata as Record<string, unknown> || {};
      const image = nft.image as Record<string, unknown> || {};

      // Resolve image: try cached thumbnail first, then raw metadata, then original
      const imageUrl =
        (image.thumbnailUrl as string) ||
        (image.cachedUrl as string) ||
        (metadata.image as string) ||
        (image.originalUrl as string) ||
        '';

      return {
        contractAddress: (contract.address as string) || '',
        tokenId: (nft.tokenId as string) || '0',
        name: (nft.name as string) || (metadata.name as string) || `#${nft.tokenId}`,
        description: (nft.description as string) || (metadata.description as string) || '',
        image: imageUrl,
        collection: (contract.name as string) || (contract.openSeaMetadata as Record<string, unknown>)?.collectionName as string || 'Unknown Collection',
        tokenType: ((nft.tokenType as string) || 'ERC721') as 'ERC721' | 'ERC1155',
        chain,
        chainId,
        raw: {
          attributes: (metadata.attributes as { trait_type: string; value: string }[]) || [],
          external_url: (metadata.external_url as string) || '',
        },
      };
    });

    // Filter out ERC-8004 Identity Registry tokens (they're ERC-721 but not "NFTs")
    const filtered = nfts.filter(nft => !FILTERED_CONTRACTS.has(nft.contractAddress.toLowerCase()));

    return NextResponse.json({
      nfts: filtered,
      totalCount: filtered.length,
      pageKey: data.pageKey || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch NFTs';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
