import { NextRequest, NextResponse } from 'next/server';
import { rejectUnknownParams } from '@/lib/server/query-params';
import { isTokenId, readArt } from '@/lib/server/booa';

export const maxDuration = 15;

/**
 * GET /api/booa-image/{tokenId}
 *
 * The BOOA's current art (SVG) from the live Ethereum renderer, for any tokenId.
 * ERC-8004 registrations point their `image` here, so 8004scan and other tools
 * show the holder's latest look.
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ tokenId: string }> },
) {
  const badParam = rejectUnknownParams(req.nextUrl.searchParams, ['live']);
  if (badParam) return badParam;
  const liveParam = req.nextUrl.searchParams.get('live');
  if (liveParam !== null && liveParam !== '1') {
    return NextResponse.json({ error: 'live must be 1' }, { status: 400 });
  }
  const id = Number((await context.params).tokenId);
  if (!isTokenId(id)) {
    return NextResponse.json({ error: 'Invalid tokenId' }, { status: 400 });
  }

  try {
    const { svg } = await readArt(id, 'live');
    if (!svg.startsWith('<svg')) return NextResponse.json({ error: 'No SVG image' }, { status: 404 });
    return new NextResponse(svg, {
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to render' }, { status: 500 });
  }
}
