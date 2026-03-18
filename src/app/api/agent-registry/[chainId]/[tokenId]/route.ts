import { NextRequest, NextResponse } from 'next/server';
import { toERC8004 } from '@/utils/helpers/exportFormats';
import { getRegistryAddress } from '@/lib/contracts/identity-registry';
import { generalLimiter, writeLimiter, getIP, rateLimitHeaders } from '@/lib/ratelimit';
import type { KhoraAgent } from '@/types/agent';
import { BOOA_NFT_ABI, isMainnetChain } from '@/lib/contracts/booa';
import type { Chain } from 'viem';
import { getRedis } from '@/lib/server/redis';

export const maxDuration = 30;

const redis = getRedis();

// Allowed chainIds to prevent Redis key poisoning
const VALID_CHAIN_IDS = new Set([
  1, 8453, 360, 137, 42161, 10, 43114, 56, 42220, 100, 534352, 59144, 5000, 1088, 2741, 10143, // mainnets
  84532, 11011, // testnets
]);

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
  if (!Number.isInteger(chainIdNum) || !VALID_CHAIN_IDS.has(chainIdNum)) {
    return NextResponse.json({ error: 'Invalid chainId' }, { status: 400 });
  }
  if (!Number.isInteger(tokenIdNum) || tokenIdNum < 0 || tokenIdNum > 100_000_000) {
    return NextResponse.json({ error: 'Invalid tokenId' }, { status: 400 });
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
    const registryAddr = getRegistryAddress(chainIdNum);
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
  const booaContract = isMainnetChain(chainIdNum)
    ? process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS
    : process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS_TESTNET;
  if (booaContract) {
    try {
      const { createPublicClient, http } = await import('viem');
      const { shape, shapeSepolia } = await import('viem/chains');
      const chainMap: Record<number, Chain> = {
        [shape.id]: shape, [shapeSepolia.id]: shapeSepolia,
      };
      const chain = chainMap[chainIdNum] || shapeSepolia;
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
    const registryAddr = getRegistryAddress(chainIdNum);
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

function isValidTxHash(hash: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(hash);
}

// POST /api/agent-registry/{chainId}/{tokenId}
// Save registry agentId after successful Identity Registry registration
// Requires txHash — verifies the Registered event on-chain before writing to Redis
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
  if (!Number.isInteger(chainIdNum) || !VALID_CHAIN_IDS.has(chainIdNum)) {
    return NextResponse.json({ error: 'Invalid chainId' }, { status: 400 });
  }
  if (!Number.isInteger(tokenIdNum) || tokenIdNum < 0 || tokenIdNum > 100_000_000) {
    return NextResponse.json({ error: 'Invalid tokenId' }, { status: 400 });
  }

  const body = await req.json();
  const { address, registryAgentId, txHash } = body;

  if (!address || !isValidAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }
  if (registryAgentId === undefined || !Number.isInteger(Number(registryAgentId))) {
    return NextResponse.json({ error: 'Invalid registryAgentId' }, { status: 400 });
  }
  if (!txHash || !isValidTxHash(txHash)) {
    return NextResponse.json({ error: 'Invalid txHash' }, { status: 400 });
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

  // Verify the registration TX on-chain
  try {
    const { createPublicClient, http, decodeEventLog } = await import('viem');
    const { shape, shapeSepolia } = await import('viem/chains');
    const { IDENTITY_REGISTRY_ABI } = await import('@/lib/contracts/identity-registry');

    const chainMap: Record<number, Chain> = {
      [shape.id]: shape, [shapeSepolia.id]: shapeSepolia,
    };
    const chain = chainMap[chainIdNum] || shapeSepolia;
    const client = createPublicClient({ chain, transport: http() });

    const receipt = await client.getTransactionReceipt({
      hash: txHash as `0x${string}`,
    });

    if (receipt.status !== 'success') {
      return NextResponse.json({ error: 'Transaction failed on-chain' }, { status: 400 });
    }

    // Find the Registered event in the receipt logs
    let verifiedAgentId: bigint | null = null;
    let verifiedOwner: string | null = null;

    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: IDENTITY_REGISTRY_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === 'Registered') {
          const args = decoded.args as { agentId: bigint; owner: string };
          verifiedAgentId = args.agentId;
          verifiedOwner = args.owner;
          break;
        }
      } catch {
        // Not our event, skip
      }
    }

    if (verifiedAgentId === null || verifiedOwner === null) {
      return NextResponse.json({ error: 'No Registered event found in transaction' }, { status: 400 });
    }

    // Verify agentId matches
    if (Number(verifiedAgentId) !== Number(registryAgentId)) {
      return NextResponse.json({ error: 'agentId mismatch between event and request' }, { status: 400 });
    }

    // Verify owner matches
    if (verifiedOwner.toLowerCase() !== address.toLowerCase()) {
      return NextResponse.json({ error: 'owner mismatch between event and request' }, { status: 400 });
    }
  } catch (err) {
    console.error('TX verification error:', err);
    return NextResponse.json({ error: 'Failed to verify transaction on-chain' }, { status: 500 });
  }

  // Save registry data (separate key, no TTL)
  const registryKey = `agent:registry:${chainIdNum}:${tokenIdNum}`;
  await redis.set(registryKey, {
    agentId: Number(registryAgentId),
    registeredAt: Date.now(),
    registeredBy: address.toLowerCase(),
    txHash,
  });

  return NextResponse.json({ ok: true }, { headers: rateLimitHeaders(rl) });
}
