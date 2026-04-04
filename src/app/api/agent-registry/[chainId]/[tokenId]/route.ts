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

const VALID_CHAIN_IDS = new Set([
  1, 8453, 360, 137, 42161, 10, 43114, 56, 42220, 100, 534352, 59144, 5000, 1088, 2741, 10143,
  84532, 11011,
]);

const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as `0x${string}`;

interface RegistrationMatch {
  agentId: number;
  current8004Owner: string | null;
  originalOwner: string | null;
}

interface VerificationResult {
  verified: boolean;
  currentNftOwner: string | null;
  agentId: number | null;
  registeredBy: string | null;
}

async function getNftOwner(tokenIdNum: number, chainIdNum: number): Promise<string | null> {
  const { createPublicClient, http } = await import('viem');
  const { shape, shapeSepolia } = await import('viem/chains');
  const { BOOA_V2_ABI } = await import('@/lib/contracts/booa-v2');

  const booaContract = isMainnetChain(chainIdNum)
    ? process.env.NEXT_PUBLIC_BOOA_V2_ADDRESS
    : process.env.NEXT_PUBLIC_BOOA_V2_ADDRESS_TESTNET;

  if (!booaContract) return null;

  const client = createPublicClient({
    chain: isMainnetChain(chainIdNum) ? shape : shapeSepolia,
    transport: http(),
  });

  try {
    return (await client.readContract({
      address: booaContract as `0x${string}`,
      abi: BOOA_V2_ABI,
      functionName: 'ownerOf',
      args: [BigInt(tokenIdNum)],
    }) as string).toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Scan 8004 registry for all agentIds whose nftOrigin.tokenId matches.
 * Returns matches with owner data for verification.
 */
async function findAllRegistrations(tokenIdNum: number, chainIdNum: number): Promise<RegistrationMatch[]> {
  try {
    const { createPublicClient, http, fallback } = await import('viem');
    const { IDENTITY_REGISTRY_ABI } = await import('@/lib/contracts/identity-registry');
    const { CHAIN_CONFIG } = await import('@/types/agent');

    const registryAddr = getRegistryAddress(chainIdNum);
    const chainEntry = Object.values(CHAIN_CONFIG).find(c => c.chainId === chainIdNum);
    if (!chainEntry) return [];

    const client = createPublicClient({
      transport: fallback(chainEntry.rpcUrls.map((url: string) => http(url))),
    });

    const maxCheck = 3000;
    const BATCH = 200;
    const found: RegistrationMatch[] = [];

    for (let start = 0; start < maxCheck; start += BATCH) {
      const contracts = [];
      for (let id = start; id < Math.min(start + BATCH, maxCheck); id++) {
        contracts.push({
          address: registryAddr,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'tokenURI' as const,
          args: [BigInt(id)],
        });
      }

      const results = await client.multicall({
        contracts,
        multicallAddress: MULTICALL3,
        allowFailure: true,
      });

      for (let i = 0; i < results.length; i++) {
        const r = results[i] as { status: string; result?: string };
        if (r.status !== 'success' || !r.result) continue;

        const uri = r.result as string;
        try {
          if (!uri.startsWith('data:')) continue;
          const b64 = uri.split(',')[1];
          const parsed = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));
          if (parsed?.nftOrigin?.tokenId === tokenIdNum) {
            const agentId = start + i;
            let current8004Owner: string | null = null;
            try {
              current8004Owner = (await client.readContract({
                address: registryAddr,
                abi: IDENTITY_REGISTRY_ABI,
                functionName: 'ownerOf',
                args: [BigInt(agentId)],
              }) as string).toLowerCase();
            } catch { /* burned or invalid */ }

            found.push({
              agentId,
              current8004Owner,
              originalOwner: parsed.nftOrigin.originalOwner?.toLowerCase() || null,
            });
          }
        } catch { /* parse failed, skip */ }
      }
    }

    return found;
  } catch (err) {
    console.error('findAllRegistrations error:', err);
    return [];
  }
}

/**
 * Fallback: find 8004 registrations by agent name when nftOrigin is missing.
 * Only matches registrations from khora.fun with matching name AND owner.
 */
async function findRegistrationsByName(
  agentName: string,
  chainIdNum: number,
  currentNftOwner: string | null,
): Promise<RegistrationMatch[]> {
  try {
    const { createPublicClient, http, fallback } = await import('viem');
    const { IDENTITY_REGISTRY_ABI } = await import('@/lib/contracts/identity-registry');
    const { CHAIN_CONFIG } = await import('@/types/agent');

    const registryAddr = getRegistryAddress(chainIdNum);
    const chainEntry = Object.values(CHAIN_CONFIG).find(c => c.chainId === chainIdNum);
    if (!chainEntry) return [];

    const client = createPublicClient({
      transport: fallback(chainEntry.rpcUrls.map((url: string) => http(url))),
    });

    const maxCheck = 3000;
    const BATCH = 200;
    const found: RegistrationMatch[] = [];

    for (let start = 0; start < maxCheck; start += BATCH) {
      const contracts = [];
      for (let id = start; id < Math.min(start + BATCH, maxCheck); id++) {
        contracts.push({
          address: registryAddr,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'tokenURI' as const,
          args: [BigInt(id)],
        });
      }

      const results = await client.multicall({
        contracts,
        multicallAddress: MULTICALL3,
        allowFailure: true,
      });

      for (let i = 0; i < results.length; i++) {
        const r = results[i] as { status: string; result?: string };
        if (r.status !== 'success' || !r.result) continue;

        const uri = r.result as string;
        try {
          if (!uri.startsWith('data:')) continue;
          const b64 = uri.split(',')[1];
          const parsed = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'));

          if (parsed?.name === agentName && parsed?.registeredVia === 'https://khora.fun') {
            const agentId = start + i;
            let current8004Owner: string | null = null;
            try {
              current8004Owner = (await client.readContract({
                address: registryAddr,
                abi: IDENTITY_REGISTRY_ABI,
                functionName: 'ownerOf',
                args: [BigInt(agentId)],
              }) as string).toLowerCase();
            } catch { /* burned */ }

            found.push({
              agentId,
              current8004Owner,
              originalOwner: parsed?.nftOrigin?.originalOwner?.toLowerCase() || null,
            });
          }
        } catch { /* skip */ }
      }
    }

    return found;
  } catch (err) {
    console.error('findRegistrationsByName error:', err);
    return [];
  }
}

/**
 * Find the verified 8004 registration for a BOOA token.
 * Uses Redis first, falls back to on-chain scan.
 * Single pass: no duplicate RPC calls.
 */
async function resolveAndVerify(
  tokenIdNum: number,
  chainIdNum: number,
  cachedRegistry: { agentId: number; registeredBy?: string } | null,
): Promise<VerificationResult> {
  const currentNftOwner = await getNftOwner(tokenIdNum, chainIdNum);
  if (!currentNftOwner) {
    return { verified: false, currentNftOwner: null, agentId: cachedRegistry?.agentId ?? null, registeredBy: cachedRegistry?.registeredBy ?? null };
  }

  // If we have cached data, verify it directly without full scan
  if (cachedRegistry) {
    const { createPublicClient, http, fallback } = await import('viem');
    const { IDENTITY_REGISTRY_ABI } = await import('@/lib/contracts/identity-registry');
    const { CHAIN_CONFIG } = await import('@/types/agent');

    const registryAddr = getRegistryAddress(chainIdNum);
    const chainEntry = Object.values(CHAIN_CONFIG).find(c => c.chainId === chainIdNum);

    if (chainEntry) {
      const client = createPublicClient({
        transport: fallback(chainEntry.rpcUrls.map((url: string) => http(url))),
      });

      let current8004Owner: string | null = null;
      let originalOwner: string | null = null;

      try {
        current8004Owner = (await client.readContract({
          address: registryAddr,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'ownerOf',
          args: [BigInt(cachedRegistry.agentId)],
        }) as string).toLowerCase();
      } catch { /* burned */ }

      try {
        const uri = await client.readContract({
          address: registryAddr,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'tokenURI',
          args: [BigInt(cachedRegistry.agentId)],
        }) as string;

        if (uri.startsWith('data:')) {
          const parsed = JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString('utf-8'));
          originalOwner = parsed?.nftOrigin?.originalOwner?.toLowerCase() || null;
        }
      } catch { /* parse failed */ }

      const verified =
        (originalOwner !== null && originalOwner === currentNftOwner) ||
        (current8004Owner !== null && current8004Owner === currentNftOwner);

      return {
        verified,
        currentNftOwner,
        agentId: cachedRegistry.agentId,
        registeredBy: current8004Owner || cachedRegistry.registeredBy || null,
      };
    }
  }

  // No cache — full on-chain scan by nftOrigin
  let allRegs = await findAllRegistrations(tokenIdNum, chainIdNum);

  // Fallback: if nftOrigin scan found nothing, try name-based matching
  // This handles registrations made before nftOrigin was added
  if (allRegs.length === 0) {
    const metadataKey = `agent:metadata:${chainIdNum}:${tokenIdNum}`;
    const metadata = await redis.get<Record<string, unknown>>(metadataKey);
    const agentName = metadata?.name as string | undefined;

    if (agentName) {
      allRegs = await findRegistrationsByName(agentName, chainIdNum, currentNftOwner);
    }
  }

  if (allRegs.length === 0) {
    return { verified: false, currentNftOwner, agentId: null, registeredBy: null };
  }

  // Find the verified registration matching current NFT owner
  const verifiedReg = allRegs.find(r =>
    r.originalOwner === currentNftOwner || r.current8004Owner === currentNftOwner
  );
  const bestReg = verifiedReg || allRegs[allRegs.length - 1];
  const verified = !!verifiedReg;

  // Cache best registration in Redis
  const registryKey = `agent:registry:${chainIdNum}:${tokenIdNum}`;
  await redis.set(registryKey, {
    agentId: bestReg.agentId,
    registeredAt: Date.now(),
    registeredBy: bestReg.current8004Owner || '',
    txHash: '',
  });

  return {
    verified,
    currentNftOwner,
    agentId: bestReg.agentId,
    registeredBy: bestReg.current8004Owner || null,
  };
}

// GET /api/agent-registry/{chainId}/{tokenId}
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

  // Redis lookup
  const registryKey = `agent:registry:${chainIdNum}:${tokenIdNum}`;
  const cachedRegistry = await redis.get<{ agentId: number; registeredBy?: string; registeredAt?: number; txHash?: string }>(registryKey);

  // Load agent metadata
  const metadataKey = `agent:metadata:${chainIdNum}:${tokenIdNum}`;
  const entry = await redis.get<Record<string, unknown>>(metadataKey);

  // Resolve and verify registration (single pass — no duplicate RPC)
  const verification = await resolveAndVerify(tokenIdNum, chainIdNum, cachedRegistry);

  // No metadata and no registration found
  if (!entry && verification.agentId === null) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  // No metadata but has registration
  if (!entry) {
    const registryAddr = getRegistryAddress(chainIdNum);
    return NextResponse.json({
      registrations: [{
        agentId: verification.agentId,
        agentRegistry: `eip155:${chainIdNum}:${registryAddr}`,
      }],
      registeredBy: verification.registeredBy,
      verified: verification.verified,
      currentNftOwner: verification.currentNftOwner,
    }, {
      headers: { 'Cache-Control': 'public, max-age=300', ...rateLimitHeaders(rl) },
    });
  }

  // Build ERC-8004 registration JSON from metadata
  const agentFields = Object.fromEntries(
    Object.entries(entry).filter(([k]) => !k.startsWith('_'))
  );
  const agent = agentFields as unknown as KhoraAgent;
  const registration = toERC8004(agent);

  // Embed on-chain SVG
  const booaContract = isMainnetChain(chainIdNum)
    ? process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS
    : process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS_TESTNET;
  if (booaContract) {
    try {
      const { createPublicClient, http } = await import('viem');
      const { shape, shapeSepolia } = await import('viem/chains');
      const chainMap: Record<number, Chain> = { [shape.id]: shape, [shapeSepolia.id]: shapeSepolia };
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
    } catch { /* fallback to metadata image */ }
  }

  // Strip empty OASF endpoint
  for (const svc of registration.services) {
    if (svc.name === 'OASF' && !svc.endpoint.trim()) {
      delete (svc as unknown as Record<string, unknown>).endpoint;
    }
  }

  // Add registrations array
  if (verification.agentId !== null) {
    const registryAddr = getRegistryAddress(chainIdNum);
    registration.registrations = [{
      agentId: verification.agentId,
      agentRegistry: `eip155:${chainIdNum}:${registryAddr}`,
    }];
  }

  return NextResponse.json({
    ...registration,
    registeredBy: verification.registeredBy,
    verified: verification.verified,
    currentNftOwner: verification.currentNftOwner,
  }, {
    headers: { 'Cache-Control': 'public, max-age=300', ...rateLimitHeaders(rl) },
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

  // Verify registration TX on-chain
  try {
    const { createPublicClient, http, fallback, decodeEventLog } = await import('viem');
    const { IDENTITY_REGISTRY_ABI } = await import('@/lib/contracts/identity-registry');
    const { CHAIN_CONFIG } = await import('@/types/agent');

    const chainEntry = Object.values(CHAIN_CONFIG).find(c => c.chainId === chainIdNum);
    if (!chainEntry) {
      return NextResponse.json({ error: 'Unsupported chain' }, { status: 400 });
    }

    const client = createPublicClient({
      transport: fallback(chainEntry.rpcUrls.map((url: string) => http(url))),
    });

    const receipt = await client.getTransactionReceipt({ hash: txHash as `0x${string}` });
    if (receipt.status !== 'success') {
      return NextResponse.json({ error: 'Transaction failed on-chain' }, { status: 400 });
    }

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
      } catch { /* not our event */ }
    }

    if (verifiedAgentId === null || verifiedOwner === null) {
      return NextResponse.json({ error: 'No Registered event found in transaction' }, { status: 400 });
    }
    if (Number(verifiedAgentId) !== Number(registryAgentId)) {
      return NextResponse.json({ error: 'agentId mismatch' }, { status: 400 });
    }
    if (verifiedOwner.toLowerCase() !== address.toLowerCase()) {
      return NextResponse.json({ error: 'owner mismatch' }, { status: 400 });
    }
  } catch (err) {
    console.error('TX verification error:', err);
    return NextResponse.json({ error: 'Failed to verify transaction on-chain' }, { status: 500 });
  }

  const registryKey = `agent:registry:${chainIdNum}:${tokenIdNum}`;
  await redis.set(registryKey, {
    agentId: Number(registryAgentId),
    registeredAt: Date.now(),
    registeredBy: address.toLowerCase(),
    txHash,
  });

  return NextResponse.json({ ok: true }, { headers: rateLimitHeaders(rl) });
}
