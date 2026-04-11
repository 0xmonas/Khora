import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 15;

const COLLECTIONS: Record<string, { url: (id: number) => string; max: number }> = {
  punk: {
    url: (id) => `https://www.cryptopunks.app/api/punks/${id}/image`,
    max: 9999,
  },
  normie: {
    url: (id) => `https://api.normies.art/normie/${id}/image.png`,
    max: 9999,
  },
};

export async function GET(request: NextRequest) {
  const col = request.nextUrl.searchParams.get('collection');
  const idStr = request.nextUrl.searchParams.get('id');

  if (!col || !COLLECTIONS[col]) {
    return NextResponse.json({ error: 'Invalid collection' }, { status: 400 });
  }
  const id = Number(idStr);
  if (!Number.isInteger(id) || id < 0 || id > COLLECTIONS[col].max) {
    return NextResponse.json({ error: 'Invalid token ID' }, { status: 400 });
  }

  try {
    const res = await fetch(COLLECTIONS[col].url(id), {
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }
    const buffer = await res.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch' }, { status: 502 });
  }
}
