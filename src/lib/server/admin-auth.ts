// Bearer-token admin auth shared across owner-only endpoints.
// Mirrors the pattern in /api/waitlist/admin. The secret is set at deploy
// time and never reaches the client.

import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';

export function checkAdminAuth(request: NextRequest, envName: string): boolean {
  const secret = process.env[envName];
  if (!secret) return false;
  const auth = request.headers.get('authorization');
  if (auth === null) return false;
  const provided = Buffer.from(auth);
  const expected = Buffer.from(`Bearer ${secret}`);
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(provided, expected);
}
