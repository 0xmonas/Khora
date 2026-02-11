import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──

const mockRedisGet = vi.fn();
const mockRedisSet = vi.fn();
const mockRedisDel = vi.fn();
const mockRedisExists = vi.fn();

vi.mock('@upstash/redis', () => ({
  Redis: class {
    get = mockRedisGet;
    set = mockRedisSet;
    del = mockRedisDel;
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

const mockReadContract = vi.fn();

vi.mock('viem', () => ({
  createPublicClient: vi.fn(() => ({
    readContract: mockReadContract,
  })),
  http: vi.fn(),
}));

vi.mock('viem/chains', () => ({
  baseSepolia: { id: 84532 },
}));

vi.mock('@/lib/contracts/booa', () => ({
  BOOA_NFT_ABI: [],
  getContractAddress: (chainId: number) =>
    chainId === 84532 ? '0x1234567890123456789012345678901234567890' : null,
}));

// ── Helpers ──

const VALID_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
const OTHER_ADDRESS = '0x1111111111111111111111111111111111111111';

function makeGetRequest(params: Record<string, string>): NextRequest {
  const url = new URL('http://localhost:3000/api/pending-reveal');
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  return new NextRequest(url);
}

function makePostRequest(
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest('http://localhost:3000/api/pending-reveal', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function makeDeleteRequest(
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): NextRequest {
  return new NextRequest('http://localhost:3000/api/pending-reveal', {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

// ── Tests ──

describe('Pending Reveal API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedisGet.mockResolvedValue(null);
    mockRedisSet.mockResolvedValue('OK');
    mockRedisDel.mockResolvedValue(1);
    mockRedisExists.mockResolvedValue(0);
    // Default: valid unrevealed commitment
    mockReadContract.mockResolvedValue([BigInt(1000000), false]);
  });

  // ════════════════════════════════════════════════
  // GET
  // ════════════════════════════════════════════════

  describe('GET /api/pending-reveal', () => {
    it('should return found:false when no entry exists', async () => {
      const { GET } = await import('@/app/api/pending-reveal/route');
      const res = await GET(
        makeGetRequest({ address: VALID_ADDRESS, chainId: '84532', slot: '0' }),
      );
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.found).toBe(false);
    });

    it('should return SVG and traits when entry exists', async () => {
      mockRedisGet.mockResolvedValue({ svg: 'abcd', traits: 'ef01' });
      const { GET } = await import('@/app/api/pending-reveal/route');
      const res = await GET(
        makeGetRequest({ address: VALID_ADDRESS, chainId: '84532', slot: '0' }),
      );
      const body = await res.json();
      expect(res.status).toBe(200);
      expect(body.found).toBe(true);
      expect(body.svg).toBe('abcd');
      expect(body.traits).toBe('ef01');
    });

    it('should return 400 when address is missing', async () => {
      const { GET } = await import('@/app/api/pending-reveal/route');
      const res = await GET(
        makeGetRequest({ chainId: '84532', slot: '0' }),
      );
      expect(res.status).toBe(400);
    });

    it('should return 400 when chainId is missing', async () => {
      const { GET } = await import('@/app/api/pending-reveal/route');
      const res = await GET(
        makeGetRequest({ address: VALID_ADDRESS, slot: '0' }),
      );
      expect(res.status).toBe(400);
    });

    it('should return 400 when slot is missing', async () => {
      const { GET } = await import('@/app/api/pending-reveal/route');
      const res = await GET(
        makeGetRequest({ address: VALID_ADDRESS, chainId: '84532' }),
      );
      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid address format', async () => {
      const { GET } = await import('@/app/api/pending-reveal/route');
      const res = await GET(
        makeGetRequest({ address: 'not-an-address', chainId: '84532', slot: '0' }),
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Invalid address format');
    });

    it('should return 429 when rate limited', async () => {
      mockGeneralLimit.mockResolvedValueOnce({
        success: false, limit: 60, remaining: 0, reset: Date.now() + 60000,
      });
      const { GET } = await import('@/app/api/pending-reveal/route');
      const res = await GET(
        makeGetRequest({ address: VALID_ADDRESS, chainId: '84532', slot: '0' }),
      );
      expect(res.status).toBe(429);
    });

    it('should use case-insensitive key lookup (address lowercased)', async () => {
      const { GET } = await import('@/app/api/pending-reveal/route');
      await GET(
        makeGetRequest({ address: VALID_ADDRESS, chainId: '84532', slot: '0' }),
      );
      expect(mockRedisGet).toHaveBeenCalledWith(
        `pending-reveal:${VALID_ADDRESS.toLowerCase()}:84532:0`,
      );
    });
  });

  // ════════════════════════════════════════════════
  // POST
  // ════════════════════════════════════════════════

  describe('POST /api/pending-reveal', () => {
    const validBody = {
      address: VALID_ADDRESS,
      chainId: 84532,
      slot: 0,
      svg: 'deadbeef',
      traits: 'cafebabe',
    };

    it('should save pending reveal data', async () => {
      const { POST } = await import('@/app/api/pending-reveal/route');
      const res = await POST(makePostRequest(validBody));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(mockRedisSet).toHaveBeenCalledWith(
        `pending-reveal:${VALID_ADDRESS.toLowerCase()}:84532:0`,
        { svg: 'deadbeef', traits: 'cafebabe' },
        { ex: 8 * 24 * 60 * 60 },
      );
    });

    it('should return 400 when address is missing', async () => {
      const { POST } = await import('@/app/api/pending-reveal/route');
      const res = await POST(makePostRequest({ ...validBody, address: undefined }));
      expect(res.status).toBe(400);
    });

    it('should return 400 when svg is missing', async () => {
      const { POST } = await import('@/app/api/pending-reveal/route');
      const res = await POST(makePostRequest({ ...validBody, svg: undefined }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid address format', async () => {
      const { POST } = await import('@/app/api/pending-reveal/route');
      const res = await POST(makePostRequest({ ...validBody, address: '0xinvalid' }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Invalid address format');
    });

    it('should return 400 for slot number out of range (>99)', async () => {
      const { POST } = await import('@/app/api/pending-reveal/route');
      const res = await POST(makePostRequest({ ...validBody, slot: 100 }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Invalid slot number');
    });

    it('should return 400 for negative slot number', async () => {
      const { POST } = await import('@/app/api/pending-reveal/route');
      const res = await POST(makePostRequest({ ...validBody, slot: -1 }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for non-integer slot', async () => {
      const { POST } = await import('@/app/api/pending-reveal/route');
      const res = await POST(makePostRequest({ ...validBody, slot: 1.5 }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for oversized SVG (>50000 chars)', async () => {
      const { POST } = await import('@/app/api/pending-reveal/route');
      const res = await POST(makePostRequest({
        ...validBody,
        svg: 'a'.repeat(50001),
      }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('SVG too large or invalid');
    });

    it('should return 400 for non-string SVG', async () => {
      const { POST } = await import('@/app/api/pending-reveal/route');
      const res = await POST(makePostRequest({ ...validBody, svg: 12345 }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for unsupported chain', async () => {
      const { POST } = await import('@/app/api/pending-reveal/route');
      const res = await POST(makePostRequest({ ...validBody, chainId: 999999 }));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Unsupported chain');
    });

    it('should return 400 when commitment does not exist on-chain', async () => {
      mockReadContract.mockResolvedValue([BigInt(0), false]);
      const { POST } = await import('@/app/api/pending-reveal/route');
      const res = await POST(makePostRequest(validBody));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('No commitment found on-chain');
    });

    it('should return 400 when slot already revealed on-chain', async () => {
      mockReadContract.mockResolvedValue([BigInt(1000000), true]);
      const { POST } = await import('@/app/api/pending-reveal/route');
      const res = await POST(makePostRequest(validBody));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Slot already revealed');
    });

    it('should return 503 when RPC is unavailable', async () => {
      mockReadContract.mockRejectedValue(new Error('RPC timeout'));
      const { POST } = await import('@/app/api/pending-reveal/route');
      const res = await POST(makePostRequest(validBody));
      expect(res.status).toBe(503);
      const body = await res.json();
      expect(body.error).toContain('Chain verification unavailable');
    });

    it('should return 409 when entry already exists (overwrite protection)', async () => {
      mockRedisExists.mockResolvedValue(1);
      const { POST } = await import('@/app/api/pending-reveal/route');
      const res = await POST(makePostRequest(validBody));
      expect(res.status).toBe(409);
      const body = await res.json();
      expect(body.error).toContain('already exists');
    });

    it('should return 429 when rate limited', async () => {
      mockWriteLimit.mockResolvedValueOnce({
        success: false, limit: 30, remaining: 0, reset: Date.now() + 60000,
      });
      const { POST } = await import('@/app/api/pending-reveal/route');
      const res = await POST(makePostRequest(validBody));
      expect(res.status).toBe(429);
    });

    it('should save empty traits when not provided', async () => {
      const { POST } = await import('@/app/api/pending-reveal/route');
      const bodyNoTraits = { ...validBody, traits: undefined };
      await POST(makePostRequest(bodyNoTraits));
      expect(mockRedisSet).toHaveBeenCalledWith(
        expect.any(String),
        { svg: 'deadbeef', traits: '' },
        { ex: 8 * 24 * 60 * 60 },
      );
    });

    // ── SIWE address enforcement ──

    it('should return 403 when x-siwe-address does not match body address', async () => {
      const { POST } = await import('@/app/api/pending-reveal/route');
      const res = await POST(
        makePostRequest(validBody, { 'x-siwe-address': OTHER_ADDRESS }),
      );
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('Address mismatch');
    });

    it('should allow request when x-siwe-address matches (case-insensitive)', async () => {
      const { POST } = await import('@/app/api/pending-reveal/route');
      const res = await POST(
        makePostRequest(validBody, {
          'x-siwe-address': VALID_ADDRESS.toLowerCase(),
        }),
      );
      expect(res.status).toBe(200);
    });

    it('should allow request when x-siwe-address header is absent (public path)', async () => {
      const { POST } = await import('@/app/api/pending-reveal/route');
      const res = await POST(makePostRequest(validBody));
      expect(res.status).toBe(200);
    });
  });

  // ════════════════════════════════════════════════
  // DELETE
  // ════════════════════════════════════════════════

  describe('DELETE /api/pending-reveal', () => {
    const validBody = {
      address: VALID_ADDRESS,
      chainId: 84532,
      slot: 0,
    };

    it('should delete pending reveal entry', async () => {
      // revealed = true on-chain
      mockReadContract.mockResolvedValue([BigInt(1000000), true]);
      const { DELETE } = await import('@/app/api/pending-reveal/route');
      const res = await DELETE(makeDeleteRequest(validBody));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.ok).toBe(true);
      expect(mockRedisDel).toHaveBeenCalledWith(
        `pending-reveal:${VALID_ADDRESS.toLowerCase()}:84532:0`,
      );
    });

    it('should return 400 when address is missing', async () => {
      const { DELETE } = await import('@/app/api/pending-reveal/route');
      const res = await DELETE(makeDeleteRequest({ chainId: 84532, slot: 0 }));
      expect(res.status).toBe(400);
    });

    it('should return 400 when chainId is missing', async () => {
      const { DELETE } = await import('@/app/api/pending-reveal/route');
      const res = await DELETE(makeDeleteRequest({ address: VALID_ADDRESS, slot: 0 }));
      expect(res.status).toBe(400);
    });

    it('should return 400 when slot is missing', async () => {
      const { DELETE } = await import('@/app/api/pending-reveal/route');
      const res = await DELETE(makeDeleteRequest({ address: VALID_ADDRESS, chainId: 84532 }));
      expect(res.status).toBe(400);
    });

    it('should return 400 for invalid address format', async () => {
      const { DELETE } = await import('@/app/api/pending-reveal/route');
      const res = await DELETE(makeDeleteRequest({ ...validBody, address: 'invalid' }));
      expect(res.status).toBe(400);
    });

    it('should return 429 when rate limited', async () => {
      mockWriteLimit.mockResolvedValueOnce({
        success: false, limit: 30, remaining: 0, reset: Date.now() + 60000,
      });
      const { DELETE } = await import('@/app/api/pending-reveal/route');
      const res = await DELETE(makeDeleteRequest(validBody));
      expect(res.status).toBe(429);
    });

    it('should allow delete even when slot not yet revealed (RPC timing)', async () => {
      mockReadContract.mockResolvedValue([BigInt(1000000), false]);
      const { DELETE } = await import('@/app/api/pending-reveal/route');
      const res = await DELETE(makeDeleteRequest(validBody));
      expect(res.status).toBe(200);
      expect(mockRedisDel).toHaveBeenCalled();
    });

    it('should allow delete when RPC fails', async () => {
      mockReadContract.mockRejectedValue(new Error('RPC timeout'));
      const { DELETE } = await import('@/app/api/pending-reveal/route');
      const res = await DELETE(makeDeleteRequest(validBody));
      expect(res.status).toBe(200);
      expect(mockRedisDel).toHaveBeenCalled();
    });

    // ── SIWE address enforcement ──

    it('should return 403 when x-siwe-address does not match', async () => {
      const { DELETE } = await import('@/app/api/pending-reveal/route');
      const res = await DELETE(
        makeDeleteRequest(validBody, { 'x-siwe-address': OTHER_ADDRESS }),
      );
      expect(res.status).toBe(403);
    });

    it('should allow delete when x-siwe-address matches', async () => {
      mockReadContract.mockResolvedValue([BigInt(1000000), true]);
      const { DELETE } = await import('@/app/api/pending-reveal/route');
      const res = await DELETE(
        makeDeleteRequest(validBody, {
          'x-siwe-address': VALID_ADDRESS.toLowerCase(),
        }),
      );
      expect(res.status).toBe(200);
    });

    it('should allow delete when x-siwe-address is absent (public path)', async () => {
      mockReadContract.mockResolvedValue([BigInt(1000000), true]);
      const { DELETE } = await import('@/app/api/pending-reveal/route');
      const res = await DELETE(makeDeleteRequest(validBody));
      expect(res.status).toBe(200);
    });
  });

  // ════════════════════════════════════════════════
  // SECURITY: Public path risks
  // ════════════════════════════════════════════════

  describe('Security — public path risks', () => {
    it('POST: attacker cannot write for non-existent commitment', async () => {
      // No commitment on-chain
      mockReadContract.mockResolvedValue([BigInt(0), false]);
      const { POST } = await import('@/app/api/pending-reveal/route');
      const res = await POST(
        makePostRequest({
          address: OTHER_ADDRESS,
          chainId: 84532,
          slot: 0,
          svg: 'attacker-svg',
        }),
      );
      expect(res.status).toBe(400);
      expect(mockRedisSet).not.toHaveBeenCalled();
    });

    it('POST: attacker cannot overwrite existing entry (first-write-wins)', async () => {
      mockRedisExists.mockResolvedValue(1);
      const { POST } = await import('@/app/api/pending-reveal/route');
      const res = await POST(
        makePostRequest({
          address: VALID_ADDRESS,
          chainId: 84532,
          slot: 0,
          svg: 'attacker-overwrite',
        }),
      );
      expect(res.status).toBe(409);
      expect(mockRedisSet).not.toHaveBeenCalled();
    });

    it('POST: attacker cannot write for already-revealed slot', async () => {
      mockReadContract.mockResolvedValue([BigInt(1000000), true]);
      const { POST } = await import('@/app/api/pending-reveal/route');
      const res = await POST(
        makePostRequest({
          address: VALID_ADDRESS,
          chainId: 84532,
          slot: 0,
          svg: 'attacker-svg',
        }),
      );
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Slot already revealed');
    });

    it('POST: rejects XSS in SVG field (validates string type)', async () => {
      const { POST } = await import('@/app/api/pending-reveal/route');
      // Non-string svg
      const res = await POST(
        makePostRequest({
          address: VALID_ADDRESS,
          chainId: 84532,
          slot: 0,
          svg: { __proto__: 'xss' },
        }),
      );
      expect(res.status).toBe(400);
    });

    it('POST: rejects address injection (non-hex characters)', async () => {
      const { POST } = await import('@/app/api/pending-reveal/route');
      const res = await POST(
        makePostRequest({
          address: '0x' + 'g'.repeat(40), // invalid hex
          chainId: 84532,
          slot: 0,
          svg: 'test',
        }),
      );
      expect(res.status).toBe(400);
    });

    it('DELETE: attacker can delete other users entry without auth (known risk)', async () => {
      // This test documents the known risk: without SIWE, DELETE works for any address
      mockReadContract.mockResolvedValue([BigInt(1000000), true]);
      const { DELETE } = await import('@/app/api/pending-reveal/route');
      const res = await DELETE(
        makeDeleteRequest({
          address: VALID_ADDRESS,
          chainId: 84532,
          slot: 0,
        }),
        // No x-siwe-address header → no address enforcement
      );
      expect(res.status).toBe(200);
      // This passes because the route is public — TTL is the safety net
    });

    it('POST: rate limiter prevents mass spam even without auth', async () => {
      mockWriteLimit.mockResolvedValueOnce({
        success: false, limit: 30, remaining: 0, reset: Date.now() + 60000,
      });
      const { POST } = await import('@/app/api/pending-reveal/route');
      const res = await POST(
        makePostRequest({
          address: VALID_ADDRESS,
          chainId: 84532,
          slot: 0,
          svg: 'spam',
        }),
      );
      expect(res.status).toBe(429);
      expect(mockRedisSet).not.toHaveBeenCalled();
    });
  });

  // ════════════════════════════════════════════════
  // Redis key format
  // ════════════════════════════════════════════════

  describe('Redis key format', () => {
    it('should use correct key format: pending-reveal:{address}:{chainId}:{slot}', async () => {
      mockRedisGet.mockResolvedValue({ svg: 'test', traits: '' });
      const { GET } = await import('@/app/api/pending-reveal/route');
      await GET(
        makeGetRequest({ address: VALID_ADDRESS, chainId: '84532', slot: '3' }),
      );
      expect(mockRedisGet).toHaveBeenCalledWith(
        `pending-reveal:${VALID_ADDRESS.toLowerCase()}:84532:3`,
      );
    });

    it('should lowercase address in key', async () => {
      const mixedCase = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12';
      const { GET } = await import('@/app/api/pending-reveal/route');
      await GET(
        makeGetRequest({ address: mixedCase, chainId: '84532', slot: '0' }),
      );
      expect(mockRedisGet).toHaveBeenCalledWith(
        `pending-reveal:${mixedCase.toLowerCase()}:84532:0`,
      );
    });
  });
});
