import { NextRequest, NextResponse } from 'next/server';
import { listSubmissionsForDay } from '@/lib/writers-room/storage';
import { WRITERS_ROOM_TOTAL_DAYS } from '@/lib/writers-room/types';
import { isValidAddress } from '@/lib/writers-room/validation';

export const maxDuration = 10;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ n: string }> },
) {
  const { n } = await context.params;
  const dayNumber = Number.parseInt(n, 10);
  if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > WRITERS_ROOM_TOTAL_DAYS) {
    return NextResponse.json({ error: 'Invalid day.' }, { status: 400 });
  }

  // Optional viewer header is set by the middleware when SIWE session exists.
  // We mark each submission with whether THIS viewer has liked it.
  const viewer = request.headers.get('x-siwe-address');
  const viewerAddress = viewer && isValidAddress(viewer) ? viewer : undefined;

  const submissions = await listSubmissionsForDay(dayNumber, viewerAddress);
  return NextResponse.json({ submissions });
}
