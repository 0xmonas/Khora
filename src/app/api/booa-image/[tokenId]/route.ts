import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import { getV2RendererAddress, BOOA_V2_RENDERER_ABI } from '@/lib/contracts/booa-v2';

export const maxDuration = 15;

/**
 * GET /api/booa-image/{tokenId}
 *
 * Serves a BOOA's on-chain art (SVG) rendered from the Ethereum renderer,
 * for ANY tokenId (storage holds all 3,333, not gated by ownership). Used as
 * the `image` field in ERC-8004 agent registrations so 8004scan and other
 * tools can display the art without embedding ~9KB of SVG on-chain.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ tokenId: string }> },
) {
  const { tokenId } = await context.params;
  const id = Number(tokenId);
  if (!Number.isInteger(id) || id < 0 || id >= 3333) {
    return NextResponse.json({ error: 'Invalid tokenId' }, { status: 400 });
  }

  const renderer = getV2RendererAddress(mainnet.id);
  if (!renderer || renderer.length <= 2) {
    return NextResponse.json({ error: 'Renderer not configured' }, { status: 500 });
  }

  try {
    const client = createPublicClient({
      chain: mainnet,
      transport: http(process.env.ETH_RPC_URL || 'https://ethereum-rpc.publicnode.com'),
    });

    const uri = (await client.readContract({
      address: renderer,
      abi: BOOA_V2_RENDERER_ABI,
      functionName: 'tokenURI',
      args: [BigInt(id)],
    })) as string;

    const comma = uri.indexOf(',');
    if (comma < 0) return NextResponse.json({ error: 'Bad token URI' }, { status: 502 });
    const meta = JSON.parse(Buffer.from(uri.slice(comma + 1), 'base64').toString('utf-8'));
    const image: string = typeof meta.image === 'string' ? meta.image : '';

    if (!image.startsWith('data:image/svg+xml')) {
      return NextResponse.json({ error: 'No SVG image' }, { status: 404 });
    }
    const imgComma = image.indexOf(',');
    const isB64 = image.slice(0, imgComma).includes('base64');
    const svg = isB64
      ? Buffer.from(image.slice(imgComma + 1), 'base64').toString('utf-8')
      : decodeURIComponent(image.slice(imgComma + 1));

    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=86400, s-maxage=604800, immutable',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to render' }, { status: 500 });
  }
}
