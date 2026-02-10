import { NextRequest, NextResponse } from 'next/server';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';

const PUBLIC_PATHS = [
  '/api/auth/nonce',
  '/api/auth/verify',
  '/api/auth/session',
  '/api/auth/logout',
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip auth routes
  if (PUBLIC_PATHS.some((path) => pathname === path)) {
    return NextResponse.next();
  }

  // Read session from cookie
  const response = NextResponse.next();
  const session = await getIronSession<SessionData>(request, response, sessionOptions);

  if (!session.address) {
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
