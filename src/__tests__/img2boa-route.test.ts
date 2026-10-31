import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import sharp from 'sharp';

vi.mock('@/lib/ratelimit', () => ({
  heavyLimiter: { limit: async () => ({ success: true }) },
  getIP: () => '203.0.113.1',
  rateLimitHeaders: () => ({}),
}));

import { POST } from '@/app/api/img2boa/route';

function post(body: Buffer, type: string) {
  const form = new FormData();
  form.append('image', new File([new Uint8Array(body)], 'x', { type }));
  return POST(new NextRequest('http://localhost/api/img2boa', { method: 'POST', body: form }));
}

describe('POST /api/img2boa', () => {
  it('refuses an SVG even when labelled as PNG', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"/>');
    expect((await post(svg, 'image/png')).status).toBe(415);
    expect((await post(svg, 'image/svg+xml')).status).toBe(415);
  });

  it('still processes a real PNG', async () => {
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#336699' } }).png().toBuffer();
    expect((await post(png, 'image/png')).status).toBe(200);
  });
});
