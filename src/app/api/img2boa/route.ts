import { NextRequest, NextResponse } from 'next/server';
import { pixelateImageWithAspect } from '@/lib/server/bitmap';
import { heavyLimiter, getIP, rateLimitHeaders } from '@/lib/ratelimit';

export const maxDuration = 30;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request: NextRequest) {
  try {
    const ip = getIP(request);
    const rl = await heavyLimiter.limit(ip);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many requests — please wait before trying again' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    const formData = await request.formData();
    const file = formData.get('image') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'File must be an image' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Image must be under 10MB' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const dataUri = `data:${file.type};base64,${base64}`;

    const result = await pixelateImageWithAspect(dataUri);

    return NextResponse.json(result);
  } catch (error) {
    console.error('img2boa error:', error);
    return NextResponse.json(
      { error: 'Failed to process image' },
      { status: 500 },
    );
  }
}
