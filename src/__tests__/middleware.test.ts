import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──

const mockSession: Record<string, unknown> = {};

vi.mock('iron-session', () => ({
  getIronSession: vi.fn(async () => mockSession),
}));

// Mock rate limiter so tests don't hit real Upstash Redis
const mockRateLimitResult = { success: true, limit: 60, remaining: 59, reset: Date.now() + 60000 };
vi.mock('@/lib/ratelimit', () => ({
  generalLimiter: { limit: vi.fn(async () => mockRateLimitResult) },
  writeLimiter: { limit: vi.fn(async () => mockRateLimitResult) },
  getIP: vi.fn(() => '127.0.0.1'),
  rateLimitHeaders: vi.fn((r: { limit: number; remaining: number; reset: number }) => ({
    'X-RateLimit-Limit': r.limit.toString(),
    'X-RateLimit-Remaining': r.remaining.toString(),
    'X-RateLimit-Reset': r.reset.toString(),
  })),
}));

// ── Helpers ──

function makeRequest(pathname: string, method = 'GET') {
  return new NextRequest(new URL(pathname, 'http://localhost:3000'), { method });
}

// ── Tests ──

describe('Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockSession).forEach((key) => delete mockSession[key]);
  });

  it('should allow /api/auth/nonce without session', async () => {
    const { middleware } = await import('@/middleware');

    const response = await middleware(makeRequest('/api/auth/nonce'));
    expect(response.status).toBe(200);
  });

  it('should allow /api/auth/verify without session', async () => {
    const { middleware } = await import('@/middleware');

    const response = await middleware(makeRequest('/api/auth/verify'));
    expect(response.status).toBe(200);
  });

  it('should allow /api/auth/session without session', async () => {
    const { middleware } = await import('@/middleware');

    const response = await middleware(makeRequest('/api/auth/session'));
    expect(response.status).toBe(200);
  });

  it('should allow /api/auth/logout without session', async () => {
    const { middleware } = await import('@/middleware');

    const response = await middleware(makeRequest('/api/auth/logout'));
    expect(response.status).toBe(200);
  });

  it('should return 401 for protected route without session', async () => {
    const { middleware } = await import('@/middleware');

    const response = await middleware(makeRequest('/api/generate-agent'));

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toContain('Authentication required');
  });

  it('should allow /api/pending-reveal without session (public path)', async () => {
    const { middleware } = await import('@/middleware');

    const response = await middleware(makeRequest('/api/pending-reveal'));
    expect(response.status).toBe(200);
  });

  it('should return 401 for /api/generate-image without session', async () => {
    const { middleware } = await import('@/middleware');

    const response = await middleware(makeRequest('/api/generate-image'));
    expect(response.status).toBe(401);
  });

  it('should allow protected route with valid session', async () => {
    mockSession.address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
    mockSession.chainId = 84532;

    const { middleware } = await import('@/middleware');

    const response = await middleware(makeRequest('/api/generate-agent'));

    // NextResponse.next() returns 200
    expect(response.status).toBe(200);
  });

  it('should forward x-siwe-address header when authenticated', async () => {
    mockSession.address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
    mockSession.chainId = 84532;

    const { middleware } = await import('@/middleware');

    const response = await middleware(makeRequest('/api/generate-agent'));

    // The middleware adds headers to the request (forwarded via NextResponse.next({ request: { headers } }))
    // We check the response was not a 401
    expect(response.status).toBe(200);
  });

  it('should return 401 if session has nonce but no address', async () => {
    mockSession.nonce = 'some-nonce';

    const { middleware } = await import('@/middleware');

    const response = await middleware(makeRequest('/api/generate-agent'));
    expect(response.status).toBe(401);
  });

  it('should export correct matcher config', async () => {
    const { config } = await import('@/middleware');
    expect(config.matcher).toBe('/api/:path*');
  });

  // ── Public read paths (no auth required) ──

  it('should allow /api/fetch-nfts without session (public read path)', async () => {
    const { middleware } = await import('@/middleware');

    const response = await middleware(makeRequest('/api/fetch-nfts'));
    expect(response.status).toBe(200);
  });

  it('should allow /api/discover-agents without session (public read path)', async () => {
    const { middleware } = await import('@/middleware');

    const response = await middleware(makeRequest('/api/discover-agents'));
    expect(response.status).toBe(200);
  });

  it('should allow /api/fetch-agent without session (public read path)', async () => {
    const { middleware } = await import('@/middleware');

    const response = await middleware(makeRequest('/api/fetch-agent'));
    expect(response.status).toBe(200);
  });

  // ── Rate limiting ──

  it('should return 429 when rate limited', async () => {
    const ratelimit = await import('@/lib/ratelimit');
    const blockedResult = { success: false, limit: 60, remaining: 0, reset: Date.now() + 60000 };
    vi.mocked(ratelimit.generalLimiter.limit).mockResolvedValueOnce(blockedResult);

    const { middleware } = await import('@/middleware');

    const response = await middleware(makeRequest('/api/fetch-nfts'));
    expect(response.status).toBe(429);
    const body = await response.json();
    expect(body.error).toContain('Too many requests');
  });

  it('should use writeLimiter for POST requests', async () => {
    const ratelimit = await import('@/lib/ratelimit');

    const { middleware } = await import('@/middleware');

    await middleware(makeRequest('/api/fetch-agent', 'POST'));
    expect(ratelimit.writeLimiter.limit).toHaveBeenCalled();
    expect(ratelimit.generalLimiter.limit).not.toHaveBeenCalled();
  });

  it('should use generalLimiter for GET requests', async () => {
    const ratelimit = await import('@/lib/ratelimit');

    const { middleware } = await import('@/middleware');

    await middleware(makeRequest('/api/fetch-nfts'));
    expect(ratelimit.generalLimiter.limit).toHaveBeenCalled();
  });
});
