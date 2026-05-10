import { NextResponse } from 'next/server';
import { getLeaderboard } from '@/lib/writers-room/storage';

export const maxDuration = 10;

export async function GET() {
  const board = await getLeaderboard(50);
  return NextResponse.json(board, {
    headers: { 'Cache-Control': 'public, max-age=30' },
  });
}
