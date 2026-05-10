import { NextResponse } from 'next/server';
import { getState, listDays } from '@/lib/writers-room/storage';

export const maxDuration = 10;

export async function GET() {
  const [state, days] = await Promise.all([getState(), listDays()]);
  return NextResponse.json({
    state,
    days,
  });
}
