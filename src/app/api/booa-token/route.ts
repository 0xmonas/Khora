import { NextRequest, NextResponse } from 'next/server';
import { BOOA_V2_ABI, getV2Address, getV2ChainId } from '@/lib/contracts/booa-v2';
import { CHAIN_CONFIG } from '@/types/agent';
import type { SupportedChain } from '@/types/agent';

export const maxDuration = 15;

/**
 * GET /api/booa-token?network=testnet&tokenId=5
 *
 * Fetches a single BOOA NFT's tokenURI from the BOOA V2 contract (NOT the 8004 registry).
 * Returns parsed metadata (name, image, attributes) for our collection only.
 */
export async function GET(request: NextRequest) {
  const network = request.nextUrl.searchParams.get('network') || 'testnet';
  const tokenIdStr = request.nextUrl.searchParams.get('tokenId');

  if (!tokenIdStr || !Number.isInteger(Number(tokenIdStr)) || Number(tokenIdStr) < 0) {
    return NextResponse.json({ error: 'Invalid tokenId' }, { status: 400 });
  }

  const tokenId = Number(tokenIdStr);
  const chain: SupportedChain = network === 'mainnet' ? 'shape' : 'shape-sepolia';
  const config = CHAIN_CONFIG[chain];
  const chainId = getV2ChainId(config.chainId);
  const contractAddress = getV2Address(chainId);

  if (!contractAddress || contractAddress.length <= 2) {
    return NextResponse.json({ error: 'BOOA contract not configured' }, { status: 500 });
  }

  try {
    const { createPublicClient, http, fallback } = await import('viem');
    const client = createPublicClient({
      transport: fallback(config.rpcUrls.map((url) => http(url))),
    });

    const tokenURI = await client.readContract({
      address: contractAddress,
      abi: BOOA_V2_ABI,
      functionName: 'tokenURI',
      args: [BigInt(tokenId)],
    }) as string;

    if (!tokenURI) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }

    // Parse data URI (our tokens are always on-chain data URIs)
    let metadata: Record<string, unknown> = {};
    if (tokenURI.startsWith('data:application/json;base64,')) {
      const json = Buffer.from(tokenURI.split(',')[1], 'base64').toString('utf-8');
      metadata = JSON.parse(json);
    } else if (tokenURI.startsWith('data:application/json,')) {
      metadata = JSON.parse(decodeURIComponent(tokenURI.split(',')[1]));
    } else {
      return NextResponse.json({ error: 'Unsupported token URI format' }, { status: 400 });
    }

    return NextResponse.json({
      tokenId,
      name: metadata.name || `BOOA #${tokenId}`,
      image: metadata.image || '',
      description: metadata.description || '',
      attributes: metadata.attributes || [],
    }, {
      headers: { 'Cache-Control': 'public, max-age=120' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('execution reverted') || message.includes('revert') || message.includes('nonexistent token')) {
      return NextResponse.json({ error: 'Token not found in BOOA collection' }, { status: 404 });
    }
    console.error('booa-token error:', error);
    return NextResponse.json({ error: 'Failed to fetch token' }, { status: 500 });
  }
}
