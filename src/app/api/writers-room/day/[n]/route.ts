import { NextRequest, NextResponse } from 'next/server';
import { getDay } from '@/lib/writers-room/storage';
import { WRITERS_ROOM_TOTAL_DAYS } from '@/lib/writers-room/types';

export const maxDuration = 10;

export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ n: string }> },
) {
  const { n } = await context.params;
  const dayNumber = Number.parseInt(n, 10);
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > WRITERS_ROOM_TOTAL_DAYS) {
    return NextResponse.json({ error: 'Invalid day.' }, { status: 400 });
  }
  const day = await getDay(dayNumber);
  if (!day) return NextResponse.json({ error: 'Day not found.' }, { status: 404 });
  return NextResponse.json({ day });
}
