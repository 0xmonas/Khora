import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/server/admin-auth';
import { getRedis } from '@/lib/server/redis';

export const maxDuration = 30;

const SCAN_BATCH = 200;

/**
 * POST /api/writers-room/admin/reset
 * Header: Authorization: Bearer <WRITERS_ROOM_ADMIN_SECRET>
 *
 * Wipes all keys under the `writers-room:` namespace and resets every
 * counter. Holder cache (`holder:v2:*`) is intentionally left alone.
 *
 * Use this only while iterating. Production cycles should never call it.
 */
export async function POST(request: NextRequest) {
  if (!checkAdminAuth(request, 'WRITERS_ROOM_ADMIN_SECRET')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const redis = getRedis();
  let cursor: string = '0';
  let deleted = 0;
  do {
    const result = (await redis.scan(cursor, {
      match: 'writers-room:*',
      count: SCAN_BATCH,
    })) as [string, string[]];
    cursor = result[0];
    const keys = result[1];
    if (keys.length > 0) {
      await redis.del(...keys);
      deleted += keys.length;
    }
  } while (cursor !== '0');

  return NextResponse.json({ ok: true, deleted });
}
