import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';

const WALLET = '0x0000000000000000000000000000000000000001';
const traits = (personality: string) =>
  '0x' + Buffer.from(JSON.stringify([
    { trait_type: 'Name', value: 'Ink-Sync' },
    { trait_type: 'Personality', value: personality },
  ])).toString('hex');

vi.mock('@/lib/server/redis', () => ({
  getRedis: () => ({ get: vi.fn(async () => null), set: vi.fn(async () => 'OK'), incr: vi.fn(async () => 1), expire: vi.fn(async () => 1) }),
}));
vi.mock('@/lib/ratelimit', () => ({ checkLoreQuota: vi.fn(async () => ({ allowed: true, remaining: 0 })) }));
vi.mock('@/lib/server/wiki', () => ({ readWikiContext: vi.fn(async () => null) }));
vi.mock('viem', () => ({
  createPublicClient: () => ({
    readContract: async ({ functionName }: { functionName: string }) => (functionName === 'ownerOf' ? WALLET : traits('Methodical')),
  }),
  http: () => ({}),
  fallback: (t: unknown[]) => t[0],
}));
vi.mock('@/lib/server/booa', () => ({
  getBooaCurrent: vi.fn(async () => ({
    name: 'BOOA #1496', owner: WALLET, home: 'ethereum',
    attributes: [{ trait_type: 'Name', value: 'Ink-Sync' }, { trait_type: 'Personality', value: 'Dry-witted' }],
  })),
}));

const generateContent = vi.fn(async (_req: unknown) => ({ text: 'A line of lore.' }));
vi.mock('@google/genai', () => ({ GoogleGenAI: class { models = { generateContent }; } }));

describe('POST /api/agent-lore/describe', () => {
  it('writes lore from the identity the holder set on Ethereum', async () => {
    process.env.GEMINI_API_KEY = 'test';
    const { POST } = await import('@/app/api/agent-lore/describe/route');
    await POST(new NextRequest('https://booa.app/api/agent-lore/describe', {
      method: 'POST',
      headers: { 'x-siwe-address': WALLET, 'content-type': 'application/json' },
      body: JSON.stringify({ chainId: 1, tokenId: 1496, previousLines: [] }),
    }));
    const sent = JSON.stringify(generateContent.mock.calls);
    expect(sent).toContain('Dry-witted');
    expect(sent).not.toContain('Methodical');
  });
});
