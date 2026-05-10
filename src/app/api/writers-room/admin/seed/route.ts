import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/server/admin-auth';
import { seedDay1, PublishError } from '@/lib/writers-room/storage';
import { validateDaySeedInput } from '@/lib/writers-room/validation';

export const maxDuration = 15;

/**
 * POST /api/writers-room/admin/seed
 * Header: Authorization: Bearer <WRITERS_ROOM_ADMIN_SECRET>
 * Body:   { caption, description, tokenId?, imageUrl? }
 *
 * Seeds Day 1 (text-only intro is the spec; tokenId/imageUrl optional).
 */
export async function POST(request: NextRequest) {
  if (!checkAdminAuth(request, 'WRITERS_ROOM_ADMIN_SECRET')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  let input;
  try {
    input = validateDaySeedInput(body);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Invalid input.' },
      { status: 400 },
    );
  }

  try {
    const day = await seedDay1(input);
    return NextResponse.json({ ok: true, day });
  } catch (e) {
    if (e instanceof PublishError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Seed failed.' }, { status: 500 });
  }
}
