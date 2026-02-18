import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisExists = vi.fn();

vi.mock('@upstash/redis', () => ({
  Redis: class {
    get = mockRedisGet;
    set = mockRedisSet;
    exists = mockRedisExists;
  },
}));

const mockGeneralLimit = vi.fn().mockResolvedValue({
  success: true, limit: 60, remaining: 59, reset: Date.now() + 60000,
});
const mockWriteLimit = vi.fn().mockResolvedValue({
  success: true, limit: 30, remaining: 29, reset: Date.now() + 60000,
});

vi.mock('@/lib/ratelimit', () => ({
  generalLimiter: { limit: (...args: unknown[]) => mockGeneralLimit(...args) },
  writeLimiter: { limit: (...args: unknown[]) => mockWriteLimit(...args) },
  getIP: () => '127.0.0.1',
  rateLimitHeaders: (result: { limit: number; remaining: number; reset: number }) => ({
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.reset.toString(),
  }),
}));

// ── Helpers ──

const VALID_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const OTHER_ADDRESS = '0x1111111111111111111111111111111111111111';

const VALID_AGENT = {
  name: 'TestAgent',
  description: 'A test agent',
  creature: 'Fox',
  vibe: 'chill',
  emoji: '🦊',
  personality: ['friendly'],
  boundaries: ['none'],
  skills: ['chat'],
  domains: ['general'],
  services: [],
  image: 'data:image/png;base64,abc',
};

function makeGetRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/agent-metadata');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url);
}

function makePostRequest(
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest('http://localhost:3000/api/agent-metadata', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

// ── Tests ──

describe('Agent Metadata API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
    mockRedisExists.mockResolvedValue(0);
  });

  // ════════════════════════════════════════════════
  // GET
  // ════════════════════════════════════════════════

  describe('GET /api/agent-metadata', () => {
    it('should return found:false when no entry exists', async () => {
      const { GET } = await import('@/app/api/agent-metadata/route');
      const res = await GET(
        makeGetRequest({ chainId: '84532', tokenId: '1', address: VALID_ADDRESS }),
      );
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.found).toBe(false);
    });

    it('should return metadata when entry exists and address matches minter', async () => {
      mockRedisGet.mockResolvedValue({
        ...VALID_AGENT,
        _minter: VALID_ADDRESS.toLowerCase(),
        _chainId: 84532,
        _tokenId: 1,
      });
      const { GET } = await import('@/app/api/agent-metadata/route');
      const res = await GET(
        makeGetRequest({ chainId: '84532', tokenId: '1', address: VALID_ADDRESS }),
      );
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.found).toBe(true);
      expect(body.metadata.name).toBe('TestAgent');
    });

    it('should return found:false when address does not match minter', async () => {
      mockRedisGet.mockResolvedValue({
        ...VALID_AGENT,
        _minter: VALID_ADDRESS.toLowerCase(),
      });
      const { GET } = await import('@/app/api/agent-metadata/route');
      const res = await GET(
        makeGetRequest({ chainId: '84532', tokenId: '1', address: OTHER_ADDRESS }),
      );
      const body = await res.json();
      expect(body.found).toBe(false);
    });

    it('should return 400 when chainId is missing', async () => {
      const { GET } = await import('@/app/api/agent-metadata/route');
      const res = await GET(
        makeGetRequest({ tokenId: '1', address: VALID_ADDRESS }),
      );
      expect(res.status).toBe(400);
    });

    it('should return 400 when tokenId is missing', async () => {
      const { GET } = await import('@/app/api/agent-metadata/route');
      const res = await GET(
        makeGetRequest({ chainId: '84532', address: VALID_ADDRESS }),
      );
      expect(res.status).toBe(400);
    });

    it('should return 400 when address is missing', async () => {
      const { GET } = await import('@/app/api/agent-metadata/route');
      const res = await GET(
        makeGetRequest({ chainId: '84532', tokenId: '1' }),
      );
      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid address format', async () => {
      const { GET } = await import('@/app/api/agent-metadata/route');
      const res = await GET(
        makeGetRequest({ chainId: '84532', tokenId: '1', address: 'bad' }),
      );
      expect(res.status).toBe(400);
    });

    it('should return 429 when rate limited', async () => {
      mockGeneralLimit.mockResolvedValueOnce({
        success: false, limit: 60, remaining: 0, reset: Date.now() + 60000,
      });
      const { GET } = await import('@/app/api/agent-metadata/route');
      const res = await GET(
        makeGetRequest({ chainId: '84532', tokenId: '1', address: VALID_ADDRESS }),
      );
      expect(res.status).toBe(429);
    });
  });

  // ════════════════════════════════════════════════
  // POST
  // ════════════════════════════════════════════════

  describe('POST /api/agent-metadata', () => {
    const validBody = {
      address: VALID_ADDRESS,
      chainId: 84532,
      tokenId: 1,
      agent: VALID_AGENT,
    };

    it('should save agent metadata', async () => {
      const { POST } = await import('@/app/api/agent-metadata/route');
      const res = await POST(makePostRequest(validBody, { 'x-siwe-address': VALID_ADDRESS.toLowerCase() }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(mockRedisSet).toHaveBeenCalledWith(
        'agent:metadata:84532:1',
        expect.objectContaining({
          name: 'TestAgent',
          _minter: VALID_ADDRESS.toLowerCase(),
          _chainId: 84532,
          _tokenId: 1,
        }),
      );
    });

    it('should return 401 when x-siwe-address header is missing', async () => {
      const { POST } = await import('@/app/api/agent-metadata/route');
      const res = await POST(makePostRequest(validBody));
      expect(res.status).toBe(401);
    });

    it('should return 400 when address is missing', async () => {
      const { POST } = await import('@/app/api/agent-metadata/route');
      const res = await POST(
        makePostRequest({ ...validBody, address: undefined }, { 'x-siwe-address': VALID_ADDRESS.toLowerCase() }),
      );
      expect(res.status).toBe(400);
    });

    it('should return 400 when agent is missing', async () => {
      const { POST } = await import('@/app/api/agent-metadata/route');
      const res = await POST(
        makePostRequest({ ...validBody, agent: undefined }, { 'x-siwe-address': VALID_ADDRESS.toLowerCase() }),
      );
      expect(res.status).toBe(400);
    });

    it('should return 400 when agent is null', async () => {
      const { POST } = await import('@/app/api/agent-metadata/route');
      const res = await POST(
        makePostRequest({ ...validBody, agent: null }, { 'x-siwe-address': VALID_ADDRESS.toLowerCase() }),
      );
      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid address format', async () => {
      const { POST } = await import('@/app/api/agent-metadata/route');
      const res = await POST(
        makePostRequest({ ...validBody, address: '0xZZZ' }, { 'x-siwe-address': VALID_ADDRESS.toLowerCase() }),
      );
      expect(res.status).toBe(400);
    });

    it('should return 400 for negative tokenId', async () => {
      const { POST } = await import('@/app/api/agent-metadata/route');
      const res = await POST(
        makePostRequest({ ...validBody, tokenId: -1 }, { 'x-siwe-address': VALID_ADDRESS.toLowerCase() }),
      );
      expect(res.status).toBe(400);
    });

    it('should return 400 for non-integer tokenId', async () => {
      const { POST } = await import('@/app/api/agent-metadata/route');
      const res = await POST(
        makePostRequest({ ...validBody, tokenId: 1.5 }, { 'x-siwe-address': VALID_ADDRESS.toLowerCase() }),
      );
      expect(res.status).toBe(400);
    });

    it('should return 400 for oversized agent metadata (>500KB)', async () => {
      const { POST } = await import('@/app/api/agent-metadata/route');
      const res = await POST(
        makePostRequest({
          ...validBody,
          agent: { ...VALID_AGENT, image: 'x'.repeat(500_001) },
        }, { 'x-siwe-address': VALID_ADDRESS.toLowerCase() }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Agent metadata too large');
    });

    it('should return 409 when metadata already exists (first-write-wins)', async () => {
      mockRedisExists.mockResolvedValue(1);
      const { POST } = await import('@/app/api/agent-metadata/route');
      const res = await POST(makePostRequest(validBody, { 'x-siwe-address': VALID_ADDRESS.toLowerCase() }));
      expect(res.status).toBe(409);
      expect(mockRedisSet).not.toHaveBeenCalled();
    });

    it('should return 403 when x-siwe-address does not match', async () => {
      const { POST } = await import('@/app/api/agent-metadata/route');
      const res = await POST(
        makePostRequest(validBody, { 'x-siwe-address': OTHER_ADDRESS }),
      );
      expect(res.status).toBe(403);
    });

    it('should allow request when x-siwe-address matches', async () => {
      const { POST } = await import('@/app/api/agent-metadata/route');
      const res = await POST(
        makePostRequest(validBody, {
          'x-siwe-address': VALID_ADDRESS.toLowerCase(),
        }),
      );
      expect(res.status).toBe(200);
    });

    it('should return 429 when rate limited', async () => {
      mockWriteLimit.mockResolvedValueOnce({
        success: false, limit: 30, remaining: 0, reset: Date.now() + 60000,
      });
      const { POST } = await import('@/app/api/agent-metadata/route');
      const res = await POST(makePostRequest(validBody, { 'x-siwe-address': VALID_ADDRESS.toLowerCase() }));
      expect(res.status).toBe(429);
    });

    it('should store metadata without TTL (permanent)', async () => {
      const { POST } = await import('@/app/api/agent-metadata/route');
      await POST(makePostRequest(validBody, { 'x-siwe-address': VALID_ADDRESS.toLowerCase() }));
      // Verify no TTL/ex option was passed
      const setCall = mockRedisSet.mock.calls[0];
      expect(setCall.length).toBe(2); // key, value — no options object
    });
  });
});
