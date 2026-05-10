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
  '/api/writers-room/admin/publish',
  '/api/writers-room/admin/seed',
  '/api/writers-room/admin/reset',
  '/api/writers-room/cron/auto-publish',
];

// Routes that work both authenticated and unauthenticated.
// Session is read and headers injected if logged in, but 401 is NOT returned.
const SOFT_AUTH_PATHS = [
  '/api/waitlist',
];

// Prefix-matched soft-auth routes. Same semantics as SOFT_AUTH_PATHS but
// any request under the prefix is treated as soft-auth (so /writers-room/*
// reads work while letting writes still inspect x-siwe-address).
const SOFT_AUTH_PREFIXES = [
  '/api/writers-room',
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
  '/api/agent-files',
  '/api/booa-token',
  '/api/banner-nfts',
  '/api/booask',
  '/api/city',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Strip any x-siwe-* headers the client may have forged. We re-set
  // these only after a server-side session check passes. Without this,
  // soft-auth and public-read paths would forward attacker-controlled
  // values straight to route handlers, letting any user impersonate
  // another address.
  const sanitizedHeaders = new Headers(request.headers);
  sanitizedHeaders.delete('x-siwe-address');
  sanitizedHeaders.delete('x-siwe-chain-id');
  const sanitizedNext = () =>
    NextResponse.next({ request: { headers: sanitizedHeaders } });

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
    return sanitizedNext();
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
    const response = NextResponse.next({ request: { headers: sanitizedHeaders } });
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    return response;
  }

  // Read session from cookie
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, sessionOptions);

  const isSoftAuth =
    SOFT_AUTH_PATHS.some((path) => pathname === path) ||
    SOFT_AUTH_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(prefix + '/'),
    );

  if (!session.address) {
    if (isSoftAuth) return sanitizedNext();
    return NextResponse.json(
      { error: 'Authentication required. Please sign in with your wallet.' },
      { status: 401 },
    );
  }

  // Re-add the verified identity headers on top of the sanitized base.
  sanitizedHeaders.set('x-siwe-address', session.address);
  if (session.chainId) {
    sanitizedHeaders.set('x-siwe-chain-id', session.chainId.toString());
  }

  return NextResponse.next({
    request: {
      headers: sanitizedHeaders,
    },
  });
}

export const config = {
  matcher: '/api/:path*',
};
