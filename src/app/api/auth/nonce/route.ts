import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { generateSiweNonce } from 'viem/siwe';
import { sessionOptions, type SessionData } from '@/lib/session';

export async function GET() {
  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

  const nonce = generateSiweNonce();

  session.nonce = nonce;
  session.address = undefined;
  session.chainId = undefined;
  await session.save();

  return NextResponse.json({ nonce });
}
