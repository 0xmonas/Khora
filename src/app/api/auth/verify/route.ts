import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { createPublicClient, http } from 'viem';
import { base, baseSepolia } from 'viem/chains';
import { parseSiweMessage, verifySiweMessage } from 'viem/siwe';
import { sessionOptions, type SessionData } from '@/lib/session';

const CHAINS = {
  [base.id]: base,
  [baseSepolia.id]: baseSepolia,
} as const;

export async function POST(request: NextRequest) {
  try {
    const { message, signature } = await request.json();

    if (!message || !signature) {
      return NextResponse.json({ error: 'Missing message or signature' }, { status: 400 });
    }

    const session = await getIronSession<SessionData>(await cookies(), sessionOptions);

    const parsed = parseSiweMessage(message);

    if (!parsed.nonce || !parsed.address || !parsed.chainId) {
      return NextResponse.json({ error: 'Invalid SIWE message' }, { status: 400 });
    }

    // Verify nonce matches session
    if (parsed.nonce !== session.nonce) {
      return NextResponse.json({ error: 'Nonce mismatch' }, { status: 422 });
    }

    // Verify domain
    const expectedDomain = request.headers.get('host') || '';
    if (parsed.domain !== expectedDomain) {
      return NextResponse.json({ error: 'Domain mismatch' }, { status: 422 });
    }

    // Chain must be supported
    const chain = CHAINS[parsed.chainId as keyof typeof CHAINS];
    if (!chain) {
      return NextResponse.json({ error: 'Unsupported chain' }, { status: 400 });
    }

    const publicClient = createPublicClient({
      chain,
      transport: http(),
    });

    // Full SIWE verification (ERC-6492 smart wallet support)
    const isValid = await verifySiweMessage(publicClient, {
      message,
      signature: signature as `0x${string}`,
    });

    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Create authenticated session
    session.address = parsed.address;
    session.chainId = parsed.chainId;
    session.nonce = undefined;
    await session.save();

    return NextResponse.json({
      ok: true,
      address: parsed.address,
      chainId: parsed.chainId,
    });
  } catch (error) {
    console.error('SIWE verify error:', error);
    return NextResponse.json(
      { error: 'Verification failed' },
      { status: 500 },
    );
  }
}
