import { NextResponse } from 'next/server';

export function rejectUnknownParams(
  searchParams: URLSearchParams,
  allowed: readonly string[],
): NextResponse | null {
  const allowedSet = new Set(allowed);

  const seen = new Set<string>();
  for (const key of searchParams.keys()) {
    if (!allowedSet.has(key)) {
      return NextResponse.json(
        { error: `Unexpected query parameter: ${key}` },
        { status: 400 },
      );
    }
    if (seen.has(key)) {
      return NextResponse.json(
        { error: `Repeated query parameter: ${key}` },
        { status: 400 },
      );
    }
    seen.add(key);
  }

  return null;
}
