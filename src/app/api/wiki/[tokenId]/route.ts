import { NextRequest, NextResponse } from 'next/server';
import { heavyLimiter, getIP, rateLimitHeaders } from '@/lib/ratelimit';
import { getWiki, MAX_TOKEN_ID } from '@/lib/server/wiki';

export const maxDuration = 60;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> },
) {
  const ip = getIP(req);
  const rl = await heavyLimiter.limit(ip);
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: rateLimitHeaders(rl) });
  }

  const { tokenId } = await params;
  if (!/^\d{1,4}$/.test(tokenId) || Number(tokenId) > MAX_TOKEN_ID) {
    return NextResponse.json({ error: `tokenId must be 0-${MAX_TOKEN_ID}` }, { status: 400 });
  }

  try {
    const wiki = await getWiki(Number(tokenId));
    if (!wiki) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }
    const cache = { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' };
    if (new URL(req.url).searchParams.get('format') === 'md') {
      return new NextResponse(wiki.markdown, {
        headers: { ...cache, 'Content-Type': 'text/markdown; charset=utf-8' },
      });
    }
    return NextResponse.json(wiki, { headers: cache });
  } catch {
    return NextResponse.json({ error: 'Failed to build wiki' }, { status: 500 });
  }
}
