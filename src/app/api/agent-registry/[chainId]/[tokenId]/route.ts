import { NextRequest, NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';
import { toERC8004 } from '@/utils/helpers/exportFormats';
import { IDENTITY_REGISTRY_MAINNET, IDENTITY_REGISTRY_TESTNET } from '@/lib/contracts/identity-registry';
import { generalLimiter, writeLimiter, getIP, rateLimitHeaders } from '@/lib/ratelimit';
import type { KhoraAgent } from '@/types/agent';
import { BOOA_NFT_ABI } from '@/lib/contracts/booa';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

// GET /api/agent-registry/{chainId}/{tokenId}
// Public endpoint — serves ERC-8004 registration JSON for the Identity Registry agentURI
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chainId: string; tokenId: string }> },
) {
  const ip = getIP(req);
  const rl = await generalLimiter.limit(ip);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const { chainId, tokenId } = await params;

  const chainIdNum = Number(chainId);
  const tokenIdNum = Number(tokenId);
  if (!Number.isInteger(chainIdNum) || !Number.isInteger(tokenIdNum) || tokenIdNum < 0) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  }

  // Check registry status first (works even without metadata)
  const registryKey = `agent:registry:${chainIdNum}:${tokenIdNum}`;
  const registryData = await redis.get<{ agentId: number }>(registryKey);

  // Load agent metadata from Upstash
  const metadataKey = `agent:metadata:${chainIdNum}:${tokenIdNum}`;
  const entry = await redis.get<Record<string, unknown>>(metadataKey);

  // If neither metadata nor registry data exists, 404
  if (!entry && !registryData) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  // If no metadata but has registry → return minimal response with registrations
  if (!entry) {
    const registryAddr = chainIdNum === 8453
      ? IDENTITY_REGISTRY_MAINNET
      : IDENTITY_REGISTRY_TESTNET;
    return NextResponse.json({
      registrations: [{
        agentId: registryData!.agentId,
        agentRegistry: `eip155:${chainIdNum}:${registryAddr}`,
      }],
    }, {
      headers: {
        'Cache-Control': 'public, max-age=300',
        ...rateLimitHeaders(rl),
      },
    });
  }

  // Strip internal fields to build KhoraAgent
  const agentFields = Object.fromEntries(
    Object.entries(entry).filter(([k]) => !k.startsWith('_'))
  );
  const agent = agentFields as unknown as KhoraAgent;

  // Build ERC-8004 registration JSON
  const registration = toERC8004(agent);

  // Fetch on-chain SVG from BOOA NFT and embed as data URI (WA005 fix)
  const booaContract = chainIdNum === 8453
    ? process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS
    : process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS_TESTNET;
  if (booaContract) {
    try {
      const { createPublicClient, http } = await import('viem');
      const { base, baseSepolia } = await import('viem/chains');
      const chain = chainIdNum === 8453 ? base : baseSepolia;
      const client = createPublicClient({ chain, transport: http() });
      const svgString = await client.readContract({
        address: booaContract as `0x${string}`,
        abi: BOOA_NFT_ABI,
        functionName: 'getSVG',
        args: [BigInt(tokenIdNum)],
      }) as string;
      if (svgString) {
        registration.image = `data:image/svg+xml;base64,${Buffer.from(svgString).toString('base64')}`;
      }
    } catch {
      // Fallback: leave image from agent (base64 pixel art)
    }
  }

  // Strip empty endpoint from OASF (WA009 fix)
  for (const svc of registration.services) {
    if (svc.name === 'OASF' && !svc.endpoint.trim()) {
      delete (svc as unknown as Record<string, unknown>).endpoint;
    }
  }

  // Add registrations[] if agent was registered on Identity Registry
  if (registryData?.agentId !== undefined) {
    const registryAddr = chainIdNum === 8453
      ? IDENTITY_REGISTRY_MAINNET
      : IDENTITY_REGISTRY_TESTNET;
    registration.registrations = [{
      agentId: registryData.agentId,
      agentRegistry: `eip155:${chainIdNum}:${registryAddr}`,
    }];
  }

  return NextResponse.json(registration, {
    headers: {
      'Cache-Control': 'public, max-age=300',
      ...rateLimitHeaders(rl),
    },
  });
}

function isValidAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

// POST /api/agent-registry/{chainId}/{tokenId}
// Save registry agentId after successful Identity Registry registration
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ chainId: string; tokenId: string }> },
) {
  const ip = getIP(req);
  const rl = await writeLimiter.limit(ip);
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const { chainId, tokenId } = await params;
  const chainIdNum = Number(chainId);
  const tokenIdNum = Number(tokenId);
  if (!Number.isInteger(chainIdNum) || !Number.isInteger(tokenIdNum) || tokenIdNum < 0) {
    return NextResponse.json({ error: 'Invalid parameters' }, { status: 400 });
  }

  const body = await req.json();
  const { address, registryAgentId } = body;

  if (!address || !isValidAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }
  if (registryAgentId === undefined || !Number.isInteger(Number(registryAgentId))) {
    return NextResponse.json({ error: 'Invalid registryAgentId' }, { status: 400 });
  }

  // Verify the caller is the minter (if metadata exists)
  const metadataKey = `agent:metadata:${chainIdNum}:${tokenIdNum}`;
  const entry = await redis.get<Record<string, unknown>>(metadataKey);
  if (entry) {
    const minter = (entry._minter as string) || '';
    if (minter && address.toLowerCase() !== minter.toLowerCase()) {
      return NextResponse.json({ error: 'Not authorized' }, { status: 403 });
    }
  }

  // Save registry data (separate key, no TTL)
  const registryKey = `agent:registry:${chainIdNum}:${tokenIdNum}`;
  await redis.set(registryKey, {
    agentId: Number(registryAgentId),
    registeredAt: Date.now(),
    registeredBy: address.toLowerCase(),
  });

  return NextResponse.json({ ok: true }, { headers: rateLimitHeaders(rl) });
}
