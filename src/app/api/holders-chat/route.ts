import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { createPublicClient, http, fallback } from 'viem';
import { shape } from 'wagmi/chains';
import { sessionOptions, type SessionData } from '@/lib/session';
import { CHAIN_CONFIG } from '@/types/agent';
import { getV2Address, BOOA_V2_ABI } from '@/lib/contracts/booa-v2';

const MIN_HOLDINGS = 3;

export async function GET() {
  const inviteUrl = process.env.HOLDERS_CHAT_INVITE_URL;
  if (!inviteUrl) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  const session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  if (!session.address) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const config = CHAIN_CONFIG['shape'];
    const client = createPublicClient({
      transport: fallback(config.rpcUrls.map((url) => http(url))),
    });

    const balance = await client.readContract({
      address: getV2Address(shape.id),
      abi: BOOA_V2_ABI,
      functionName: 'balanceOf',
      args: [session.address as `0x${string}`],
    }) as bigint;

    if (balance < BigInt(MIN_HOLDINGS)) {
      return NextResponse.json(
        { error: 'Insufficient holdings', required: MIN_HOLDINGS, current: Number(balance) },
        { status: 403 },
      );
    }

    return NextResponse.json({ url: inviteUrl });
  } catch {
    return NextResponse.json({ error: 'Failed to verify holdings' }, { status: 500 });
  }
}
