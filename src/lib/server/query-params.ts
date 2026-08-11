import { NextResponse } from 'next/server';

/**
 * Reject query parameters the route does not read.
 *
 * A CDN keys its cache on the full URL, including parameters the handler
 * ignores. So `?address=X` and `?address=X&junk=1` are two separate cache
 * entries answered by identical work, and an attacker can mint unlimited
 * distinct keys to force a guaranteed miss on every request. On routes that
 * reach a metered upstream, that converts caching from a cost control into a
 * cost amplifier.
 *
 * Rejecting unknown keys collapses the key space back to the parameters that
 * actually determine the response.
 *
 * Returns a 400 response when an unexpected parameter is present, otherwise
 * null so the caller continues.
 */
export function rejectUnknownParams(
  searchParams: URLSearchParams,
  allowed: readonly string[],
): NextResponse | null {
  const allowedSet = new Set(allowed);

  for (const key of searchParams.keys()) {
    if (!allowedSet.has(key)) {
      return NextResponse.json(
        { error: `Unexpected query parameter: ${key}` },
        { status: 400 },
      );
    }
  }

  return null;
}
