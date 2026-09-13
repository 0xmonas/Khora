import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getIronSession } from 'iron-session';
import { createPublicClient, http, verifyMessage } from 'viem';
import { shape, shapeSepolia, mainnet, base, arbitrum, optimism, polygon, avalanche, bsc, celo, gnosis, scroll, linea, mantle } from 'viem/chains';
import { parseSiweMessage, validateSiweMessage, verifySiweMessage } from 'viem/siwe';
import { sessionOptions, type SessionData } from '@/lib/session';
import { serverRpcUrl } from '@/lib/chains/rpc';

export const maxDuration = 15;

// Accept SIWE from any supported chain — auth is chain-agnostic,
// the user just needs to prove wallet ownership
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const CHAINS: Record<number, any> = {
  [shape.id]: shape,
  [shapeSepolia.id]: shapeSepolia,
  [mainnet.id]: mainnet,
  [base.id]: base,
  [arbitrum.id]: arbitrum,
  [optimism.id]: optimism,
  [polygon.id]: polygon,
  [avalanche.id]: avalanche,
  [bsc.id]: bsc,
  [celo.id]: celo,
  [gnosis.id]: gnosis,
  [scroll.id]: scroll,
  [linea.id]: linea,
  [mantle.id]: mantle,
};

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
    const expectedNonce = session.nonce;
    if (!expectedNonce || parsed.nonce !== expectedNonce) {
      session.nonce = undefined;
      await session.save();
      return NextResponse.json({ error: 'Nonce mismatch' }, { status: 422 });
    }

    // SIWE domain binding: the domain the user saw in their wallet MUST be the host
    // actually serving this request. Without it, a signature phished on any
    // attacker-controlled origin replays here to open a session as the victim.
    //
    // We use the `host` header, NOT `x-forwarded-host`. On Vercel a request only
    // reaches this deployment if its Host matches one of THIS project's domains
    // (Vercel routes by Host), so `host` cannot be spoofed to an attacker's own
    // domain — whereas `x-forwarded-host` is a client-settable header that Vercel
    // only backfills when absent, so trusting it re-opens the bypass off-Vercel.
    // If a reverse proxy is ever placed in front of Vercel, revisit this.
    const serverHost = (request.headers.get('host') || '').split(',')[0].trim().toLowerCase();

    let uriHost: string;
    try {
      uriHost = new URL(parsed.uri ?? '').host.toLowerCase();
    } catch {
      uriHost = '';
    }

    if (
      !serverHost ||
      !parsed.domain ||
      parsed.domain.toLowerCase() !== serverHost ||
      uriHost !== serverHost
    ) {
      session.nonce = undefined;
      await session.save();
      return NextResponse.json({ error: 'Domain mismatch' }, { status: 422 });
    }

    // Chain must be supported
    const chain = CHAINS[parsed.chainId as keyof typeof CHAINS];
    if (!chain) {
      session.nonce = undefined;
      await session.save();
      return NextResponse.json({ error: 'Unsupported chain' }, { status: 400 });
    }

    // domain/nonce/address are passed explicitly — omitting them makes viem skip
    // those checks entirely.
    const sig = signature as `0x${string}`;
    const fieldsValid = validateSiweMessage({
      message: parsed,
      address: parsed.address,
      domain: serverHost,
      nonce: expectedNonce,
    });
    let isValid =
      fieldsValid &&
      (await verifyMessage({ address: parsed.address, message, signature: sig }).catch(() => false));
    if (fieldsValid && !isValid) {
      const publicClient = createPublicClient({
        chain,
        transport: http(serverRpcUrl(chain), { timeout: 4_000, retryCount: 1 }),
      });
      isValid = await verifySiweMessage(publicClient, {
        message,
        signature: sig,
        address: parsed.address,
        domain: serverHost,
        nonce: expectedNonce,
      });
    }

    if (!isValid) {
      session.nonce = undefined;
      await session.save();
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
