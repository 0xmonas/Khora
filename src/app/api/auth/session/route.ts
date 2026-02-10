import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { sessionOptions, type SessionData } from '@/lib/session';

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

  if (!session.address) {
    return NextResponse.json({ address: null, chainId: null });
  }

  return NextResponse.json({
    address: session.address,
    chainId: session.chainId,
  });
}
