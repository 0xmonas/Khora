import { NextResponse } from 'next/server';

export function POST() {
  return NextResponse.json({ error: 'Minting has ended.' }, { status: 410 });
}
