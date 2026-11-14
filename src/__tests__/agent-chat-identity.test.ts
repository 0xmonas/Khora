import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

const WALLET = '0x0000000000000000000000000000000000000001';

vi.mock('@/lib/server/redis', () => ({
  getRedis: () => ({ get: vi.fn(async () => null), incr: vi.fn(async () => 1), expire: vi.fn(async () => 1) }),
}));
vi.mock('@/lib/ratelimit', () => ({ checkChatQuota: vi.fn(async () => ({ allowed: true, remaining: 9 })) }));
vi.mock('@/lib/server/awakened', () => ({ findAwakening: vi.fn(async () => null) }));

const originalUri = 'data:application/json;base64,' + Buffer.from(JSON.stringify({
  name: 'BOOA #1496',
  attributes: [{ trait_type: 'Name', value: 'Ink-Sync' }, { trait_type: 'Personality', value: 'Methodical' }],
})).toString('base64');
vi.mock('viem', () => ({
  createPublicClient: () => ({
    readContract: async ({ functionName }: { functionName: string }) => (functionName === 'ownerOf' ? WALLET : originalUri),
  }),
  http: () => ({}),
}));

vi.mock('@/lib/server/booa', () => ({
  getBooaCurrent: vi.fn(async () => ({
    name: 'BOOA #1496',
    owner: WALLET,
    home: 'ethereum',
    attributes: [{ trait_type: 'Name', value: 'Ink-Sync' }, { trait_type: 'Personality', value: 'Dry-witted' }],
  })),
}));

const generateContent = vi.fn(async (_req: unknown) => ({ text: 'hi' }));
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent }; } }));

describe('POST /api/agent-chat', () => {
  it('speaks with the identity the holder set on chain', async () => {
    process.env.GEMINI_API_KEY = 'test';
    const { POST } = await import('@/app/api/agent-chat/route');
    const res = await POST(new NextRequest('https://booa.app/api/agent-chat', {
      method: 'POST',
      headers: { 'x-siwe-address': WALLET, 'content-type': 'application/json' },
      body: JSON.stringify({ tokenId: 1496, chainId: 1, message: 'who are you?', history: [] }),
    }));
    expect(res.status).toBe(200);
    const sent = JSON.stringify(generateContent.mock.calls);
    expect(sent).toContain('Dry-witted');
    expect(sent).not.toContain('Methodical');
  });
});
