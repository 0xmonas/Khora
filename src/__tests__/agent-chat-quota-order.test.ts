import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

const incr = vi.fn(async () => 1);
vi.mock('@/lib/server/redis', () => ({
  getRedis: () => ({ get: vi.fn(async () => null), incr, expire: vi.fn(async () => 1) }),
}));

const checkChatQuota = vi.fn(async () => ({ allowed: true, remaining: 9 }));
vi.mock('@/lib/ratelimit', () => ({ checkChatQuota: (...a: unknown[]) => checkChatQuota(...(a as [])) }));

vi.mock('@/lib/server/booa', () => ({ getBooaCurrent: vi.fn() }));

vi.mock('viem', () => ({
  createPublicClient: () => ({ readContract: async () => '0x000000000000000000000000000000000000dEaD' }),
  http: () => ({}),
}));

describe('POST /api/agent-chat', () => {
  it('rejects a non-holder before spending any chat quota', async () => {
    const { POST } = await import('@/app/api/agent-chat/route');
    const res = await POST(new NextRequest('https://booa.app/api/agent-chat', {
      method: 'POST',
      headers: { 'x-siwe-address': '0x0000000000000000000000000000000000000001', 'content-type': 'application/json' },
      body: JSON.stringify({ tokenId: 1, chainId: 1, message: 'hello', history: [] }),
    }));
    expect(res.status).toBe(403);
    expect(checkChatQuota).not.toHaveBeenCalled();
    expect(incr).not.toHaveBeenCalled();
  });
});
