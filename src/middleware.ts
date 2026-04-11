import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';
import { generalLimiter, writeLimiter, getIP, rateLimitHeaders } from '@/lib/ratelimit-edge';

// Routes that skip SIWE session but ARE rate-limited.
// Auth routes handle their own security (nonce matching, signature verification, Bearer token).
const AUTH_PATHS = [
  '/api/auth/nonce',
  '/api/auth/verify',
  '/api/auth/session',
  '/api/auth/logout',
  '/api/waitlist/admin',
];

// Routes that work both authenticated and unauthenticated.
// Session is read and headers injected if logged in, but 401 is NOT returned.
const SOFT_AUTH_PATHS = [
  '/api/waitlist',
];

// Public read-only routes — no auth required, rate-limited
const PUBLIC_READ_PATHS = [
  '/api/fetch-nfts',
  '/api/discover-agents',
  '/api/fetch-agent',
  '/api/gallery',
  '/api/agent-card',
  '/api/agent-registry',
  '/api/stats',
  '/api/pixel-forge-import',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Rate limiting (applied to ALL API routes, no exceptions) ──
  const ip = getIP(request);
  const isWrite = request.method !== 'GET';
  const rl = await (isWrite ? writeLimiter : generalLimiter).limit(ip);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  // Auth routes — rate-limited above, skip SIWE (they handle their own auth)
  if (AUTH_PATHS.some((path) => pathname === path)) {
    return NextResponse.next();
  }

  // Public read-only routes — skip auth, already rate-limited above
  if (PUBLIC_READ_PATHS.some((path) => pathname === path || pathname.startsWith(path + '/'))) {
    // Handle CORS preflight (OPTIONS) requests
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }
    const response = NextResponse.next();
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    return response;
  }

  // Read session from cookie
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, sessionOptions);

  const isSoftAuth = SOFT_AUTH_PATHS.some((path) => pathname === path);

  if (!session.address) {
    if (isSoftAuth) return NextResponse.next();
    return NextResponse.json(
      { error: 'Authentication required. Please sign in with your wallet.' },
      { status: 401 },
    );
  }

  // Forward authenticated address to route handlers via headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-siwe-address', session.address);
  if (session.chainId) {
    requestHeaders.set('x-siwe-chain-id', session.chainId.toString());
  }

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: '/api/:path*',
};
