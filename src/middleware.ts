import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';
import { generalLimiter, writeLimiter, getIP, rateLimitHeaders } from '@/lib/ratelimit';

// Routes that skip session entirely (no auth needed, no headers injected)
const SKIP_PATHS = [
  '/api/auth/nonce',
  '/api/auth/verify',
  '/api/auth/session',
  '/api/auth/logout',
];

// Routes that work both authenticated and unauthenticated.
// Session is read and headers injected if logged in, but 401 is NOT returned.
const SOFT_AUTH_PATHS = [
  '/api/agent-metadata',
  '/api/pending-reveal',
];

// Public read-only routes — no auth required, rate-limited
const PUBLIC_READ_PATHS = [
  '/api/fetch-nfts',
  '/api/discover-agents',
  '/api/fetch-agent',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth routes entirely
  if (SKIP_PATHS.some((path) => pathname === path)) {
    return NextResponse.next();
  }

  // ── Rate limiting (applied to all API routes) ──
  const ip = getIP(request);
  const isWrite = request.method !== 'GET';
  const rl = await (isWrite ? writeLimiter : generalLimiter).limit(ip);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many requests. Please try again later.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  // Public read-only routes — skip auth, already rate-limited above
  if (PUBLIC_READ_PATHS.some((path) => pathname === path || pathname.startsWith(path + '/'))) {
    return NextResponse.next();
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
