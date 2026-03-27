import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { createPublicClient, http, fallback } from 'viem';
import { shape } from 'wagmi/chains';
import { sessionOptions, type SessionData } from '@/lib/session';
import { CHAIN_CONFIG } from '@/types/agent';
import { getV2Address, BOOA_V2_ABI } from '@/lib/contracts/booa-v2';
import { generalLimiter, getIP, rateLimitHeaders } from '@/lib/ratelimit';

const MIN_HOLDINGS = 3;

export async function GET(request: NextRequest) {
  // Rate limit: prevent brute-force / RPC abuse
  const ip = getIP(request);
  const rl = await generalLimiter.limit(ip);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const inviteUrl = process.env.HOLDERS_CHAT_INVITE_URL;
  if (!inviteUrl) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  let session: SessionData;
  try {
    session = await getIronSession<SessionData>(await cookies(), sessionOptions);
  } catch (e) {
    console.error('holders-chat session error:', e);
    return NextResponse.json({ error: 'Session error' }, { status: 401 });
  }

  if (!session.address) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const config = CHAIN_CONFIG['shape'];
    if (!config) {
      console.error('holders-chat: shape chain config not found');
      return NextResponse.json({ error: 'Chain config error' }, { status: 500 });
    }

    const contractAddress = getV2Address(shape.id);
    if (!contractAddress || contractAddress.length <= 2) {
      console.error('holders-chat: BOOA contract address not configured');
      return NextResponse.json({ error: 'Contract not configured' }, { status: 500 });
    }

    const client = createPublicClient({
      transport: fallback(config.rpcUrls.map((url) => http(url))),
    });

    const balance = await client.readContract({
      address: contractAddress,
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
  } catch (e) {
    console.error('holders-chat RPC error:', e);
    return NextResponse.json({ error: 'Failed to verify holdings' }, { status: 500 });
  }
}
