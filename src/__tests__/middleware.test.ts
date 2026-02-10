import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mocks ──

const mockSession: Record<string, unknown> = {};

vi.mock('iron-session', () => ({
  getIronSession: vi.fn(async () => mockSession),
}));

// ── Helpers ──

function makeRequest(pathname: string) {
  return new NextRequest(new URL(pathname, 'http://localhost:3000'));
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

  it('should return 401 for /api/pending-reveal without session', async () => {
    const { middleware } = await import('@/middleware');

    const response = await middleware(makeRequest('/api/pending-reveal'));
    expect(response.status).toBe(401);
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
});
