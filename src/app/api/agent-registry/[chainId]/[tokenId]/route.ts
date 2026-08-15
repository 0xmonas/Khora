import { NextRequest, NextResponse } from 'next/server';
import { toERC8004 } from '@/utils/helpers/exportFormats';
import { getRegistryAddress } from '@/lib/contracts/identity-registry';
import { getAdapterAddress } from '@/lib/contracts/booa-adapter';
import { generalLimiter, writeLimiter, getIP, rateLimitHeaders } from '@/lib/ratelimit';
import type { BooaAgent } from '@/types/agent';
import { BOOA_NFT_ABI, isMainnetChain, isTestnetChain } from '@/lib/contracts/booa';
import type { Chain } from 'viem';
import { getRedis } from '@/lib/server/redis';

export const maxDuration = 30;

const redis = getRedis();

const VALID_CHAIN_IDS = new Set([
  1, 8453, 360, 137, 42161, 10, 43114, 56, 42220, 100, 534352, 59144, 5000, 1088, 2741, 143, 4663,
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
  // True only when the agent is held by our canonical adapter AND its on-chain
  // binding provably names the BOOA collection + this tokenId. `bound`/`controller`/
  // `agentWallet` in the response must derive from this, never from "owner == adapter"
  // alone — a foreign ERC-721 bound through the shared adapter also reads owner==adapter.
  boundToBooa: boolean;
}

async function getNftOwner(tokenIdNum: number, chainIdNum: number): Promise<string | null> {
  const { createPublicClient, http, fallback } = await import('viem');
  const { mainnet, shape, shapeSepolia } = await import('viem/chains');
  const { BOOA_V2_ABI, getV2Address } = await import('@/lib/contracts/booa-v2');
  const { CHAIN_CONFIG } = await import('@/types/agent');

  // The collection's canonical home is Ethereum. Migrated tokens are burned on
  // Shape, so an Ethereum-first read with a Shape fallback covers both migrated
  // and not-yet-migrated BOOAs. Testnet queries stay on Shape Sepolia. Note:
  // isMainnetChain() means "is Shape" (legacy), so gate on !isTestnetChain —
  // any production registry chain (Ethereum, Base, …) reads the mainnet homes.
  const candidates = !isTestnetChain(chainIdNum)
    ? [{ chain: mainnet, address: getV2Address(mainnet.id) }, { chain: shape, address: getV2Address(shape.id) }]
    : [{ chain: shapeSepolia, address: getV2Address(shapeSepolia.id) }];

  for (const { chain, address } of candidates) {
    if (!address || address.length < 4) continue;
    const cfg = Object.values(CHAIN_CONFIG).find(c => c.chainId === chain.id);
    const client = createPublicClient({
      chain,
      transport: cfg?.rpcUrls?.length ? fallback(cfg.rpcUrls.map((u: string) => http(u))) : http(),
    });
    try {
      return (await client.readContract({
        address: address as `0x${string}`,
        abi: BOOA_V2_ABI,
        functionName: 'ownerOf',
        args: [BigInt(tokenIdNum)],
      }) as string).toLowerCase();
    } catch { /* burned here (migrated) or RPC failed — try the next home */ }
  }
  return null;
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
 * Fallback: find 8004 registrations owned by the NFT owner that match by name.
 * Scoped to owner's agents only — no global name search.
 */
async function findRegistrationsByOwner(
  agentName: string,
  chainIdNum: number,
  ownerAddress: string,
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

    // Check how many 8004 tokens this owner has
    let balance = 0;
    try {
      balance = Number(await client.readContract({
        address: registryAddr,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'balanceOf',
        args: [ownerAddress as `0x${string}`],
      }));
    } catch { return []; }

    if (balance === 0) return [];

    // Scan to find owner's agentIds via ownerOf multicall
    const maxCheck = 3000;
    const BATCH = 200;
    const ownedIds: number[] = [];

    for (let start = 0; start < maxCheck && ownedIds.length < balance; start += BATCH) {
      const contracts = [];
      for (let id = start; id < Math.min(start + BATCH, maxCheck); id++) {
        contracts.push({
          address: registryAddr,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'ownerOf' as const,
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
        if (r.status === 'success' && (r.result as string)?.toLowerCase() === ownerAddress.toLowerCase()) {
          ownedIds.push(start + i);
        }
      }
    }

    if (ownedIds.length === 0) return [];

    // Read tokenURI for owned agentIds and match by name
    const found: RegistrationMatch[] = [];
    for (const agentId of ownedIds) {
      try {
        const uri = await client.readContract({
          address: registryAddr,
          abi: IDENTITY_REGISTRY_ABI,
          functionName: 'tokenURI',
          args: [BigInt(agentId)],
        }) as string;

        if (!uri.startsWith('data:')) continue;
        const parsed = JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString('utf-8'));

        if (parsed?.name === agentName) {
          found.push({
            agentId,
            current8004Owner: ownerAddress.toLowerCase(),
            originalOwner: parsed?.nftOrigin?.originalOwner?.toLowerCase() || null,
          });
        }
      } catch { /* skip */ }
    }

    return found;
  } catch (err) {
    console.error('findRegistrationsByOwner error:', err);
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
  cachedRegistry: { agentId: number; registeredBy?: string; registrantOwner?: string } | null,
): Promise<VerificationResult> {
  const currentNftOwner = await getNftOwner(tokenIdNum, chainIdNum);
  if (!currentNftOwner) {
    return { verified: false, currentNftOwner: null, agentId: cachedRegistry?.agentId ?? null, registeredBy: cachedRegistry?.registeredBy ?? null, boundToBooa: false };
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

      // If the cached agent's URI was wiped (no nftOrigin) it was likely deprecated
      // by an "Upgrade to Adapter" flow. Fall through to full scan to surface the
      // newer adapter-bound agent for this NFT.
      const looksDeprecated = originalOwner === null;
      if (!looksDeprecated) {
        // `verified` may only rest on on-chain state. nftOrigin.originalOwner comes
        // from the agentURI, which the registrant authors freely (register() is
        // permissionless) — matching it proves nothing about ownership.
        let verified = current8004Owner !== null && current8004Owner === currentNftOwner;
        let boundToBooa = false;

        // ERC-8217: the agent is held by OUR canonical adapter and its binding names
        // the BOOA collection and this tokenId → the NFT owner is the controller.
        const adapterForVerify = getAdapterAddress(chainIdNum);
        if (
          current8004Owner &&
          adapterForVerify &&
          current8004Owner === adapterForVerify.toLowerCase()
        ) {
          try {
            const { getV2Address } = await import('@/lib/contracts/booa-v2');
            const booaAddr = getV2Address(chainIdNum) || getV2Address(1);
            const binding = await client.readContract({
              address: adapterForVerify,
              abi: [{
                type: 'function',
                name: 'bindingOf',
                stateMutability: 'view',
                inputs: [{ name: 'agentId', type: 'uint256' }],
                outputs: [{
                  name: 'binding',
                  type: 'tuple',
                  components: [
                    { name: 'standard', type: 'uint8' },
                    { name: 'tokenContract', type: 'address' },
                    { name: 'tokenId', type: 'uint256' },
                  ],
                }],
              }] as const,
              functionName: 'bindingOf',
              args: [BigInt(cachedRegistry.agentId)],
            }) as { standard: number; tokenContract: `0x${string}`; tokenId: bigint };
            if (
              Number(binding.tokenId) === tokenIdNum &&
              !!booaAddr &&
              binding.tokenContract.toLowerCase() === booaAddr.toLowerCase()
            ) {
              verified = true;
              boundToBooa = true;
            }
          } catch { /* binding unreadable */ }
        }

        // Scenario B (recommended flow): the BOOA owner registered this agent, then
        // moved the agent's 8004 NFT to a separate agent wallet. registrantOwner is
        // written only by the ownership-gated POST, so matching it against the current
        // NFT owner is sound — an attacker can never be the victim's NFT owner, and the
        // match breaks the moment the NFT is sold.
        if (
          !verified &&
          cachedRegistry.registrantOwner &&
          cachedRegistry.registrantOwner === currentNftOwner
        ) {
          verified = true;
        }

        return {
          verified,
          currentNftOwner,
          agentId: cachedRegistry.agentId,
          registeredBy: current8004Owner || cachedRegistry.registeredBy || null,
          boundToBooa,
        };
      }
    }
  }

  // Adapter-bound (Awakened) lookup first: the AgentBound event scan resolves a
  // bound NFT straight to its agentId. The id-range scan below stops at 3000 and
  // can never reach mainnet's 36k+ agent ids, so awakened agents would 404 here.
  const adapterForChain = getAdapterAddress(chainIdNum);
  if (adapterForChain) {
    try {
      const { findAwakening } = await import('@/lib/server/awakened');
      const awakening = await findAwakening(chainIdNum, tokenIdNum);
      if (awakening) {
        const { createPublicClient, http, fallback } = await import('viem');
        const { IDENTITY_REGISTRY_ABI } = await import('@/lib/contracts/identity-registry');
        const { CHAIN_CONFIG } = await import('@/types/agent');
        const chainEntry = Object.values(CHAIN_CONFIG).find(c => c.chainId === chainIdNum);
        if (chainEntry) {
          const client = createPublicClient({
            transport: fallback(chainEntry.rpcUrls.map((url: string) => http(url))),
          });
          const owner8004 = (await client.readContract({
            address: getRegistryAddress(chainIdNum),
            abi: IDENTITY_REGISTRY_ABI,
            functionName: 'ownerOf',
            args: [BigInt(awakening.agentId)],
          }) as string).toLowerCase();
          // Still bound (adapter owns the agent) → controller == NFT owner by construction.
          // findAwakening resolves via AgentBound logs already filtered to tokenContract
          // == BOOA (awakened.ts), so this is a validated BOOA binding.
          if (owner8004 === adapterForChain.toLowerCase()) {
            return {
              verified: true,
              currentNftOwner,
              agentId: awakening.agentId,
              registeredBy: owner8004,
              boundToBooa: true,
            };
          }
        }
      }
    } catch { /* fall through to the range scan */ }
  }

  // No cache (or cached looked deprecated) — full on-chain scan by nftOrigin
  let allRegs = await findAllRegistrations(tokenIdNum, chainIdNum);

  // Fallback: if nftOrigin scan found nothing, try name-based matching
  // This handles registrations made before nftOrigin was added
  if (allRegs.length === 0) {
    const metadataKey = `agent:metadata:${chainIdNum}:${tokenIdNum}`;
    const metadata = await redis.get<Record<string, unknown>>(metadataKey);
    const agentName = metadata?.name as string | undefined;

    if (agentName) {
      allRegs = await findRegistrationsByOwner(agentName, chainIdNum, currentNftOwner);
    }
  }

  if (allRegs.length === 0) {
    return { verified: false, currentNftOwner, agentId: null, registeredBy: null, boundToBooa: false };
  }

  // Only an on-chain fact can mark a registration verified: the NFT owner holds the
  // agent NFT directly. originalOwner is self-asserted metadata and is used purely as
  // a display-selection hint below, never as proof.
  let verifiedReg = allRegs.find(r => r.current8004Owner === currentNftOwner);
  // Whether verification came via a validated adapter binding (vs the NFT owner
  // directly holding the agent NFT). Drives `bound`/`controller`/`agentWallet`.
  let boundViaBinding = false;

  // ERC-8217: an agent held by OUR canonical adapter whose binding names the BOOA
  // collection and this tokenId. The adapter enforces controller == NFT owner on
  // every write, so a valid binding is canonical verification.
  if (!verifiedReg && allRegs.length > 0) {
    const adapterForScan = getAdapterAddress(chainIdNum);
    if (adapterForScan) {
      const { createPublicClient, http, fallback } = await import('viem');
      const { CHAIN_CONFIG } = await import('@/types/agent');
      const { getV2Address } = await import('@/lib/contracts/booa-v2');
      const booaAddr = getV2Address(chainIdNum) || getV2Address(1);
      const chainEntry = Object.values(CHAIN_CONFIG).find(c => c.chainId === chainIdNum);
      if (chainEntry) {
        const client = createPublicClient({
          transport: fallback(chainEntry.rpcUrls.map((url: string) => http(url))),
        });
        const bindingAbi = [{
          type: 'function',
          name: 'bindingOf',
          stateMutability: 'view',
          inputs: [{ name: 'agentId', type: 'uint256' }],
          outputs: [{
            name: 'binding',
            type: 'tuple',
            components: [
              { name: 'standard', type: 'uint8' },
              { name: 'tokenContract', type: 'address' },
              { name: 'tokenId', type: 'uint256' },
            ],
          }],
        }] as const;
        for (const r of allRegs) {
          if (!r.current8004Owner) continue;
          if (r.current8004Owner !== adapterForScan.toLowerCase()) continue;
          try {
            const binding = await client.readContract({
              address: adapterForScan,
              abi: bindingAbi,
              functionName: 'bindingOf',
              args: [BigInt(r.agentId)],
            }) as { standard: number; tokenContract: `0x${string}`; tokenId: bigint };
            if (
              Number(binding.tokenId) === tokenIdNum &&
              !!booaAddr &&
              binding.tokenContract.toLowerCase() === booaAddr.toLowerCase()
            ) {
              verifiedReg = r;
              boundViaBinding = true;
              break;
            }
          } catch { /* binding unreadable — skip */ }
        }
      }
    }
  }

  const originHint = allRegs.find(r => r.originalOwner === currentNftOwner);
  const bestReg = verifiedReg || originHint || allRegs[allRegs.length - 1];
  const verified = !!verifiedReg;

  // Only a verified resolution is cached permanently. An unverified guess is held
  // briefly so an anonymous GET cannot pin a wrong agentId to a token forever.
  const registryKey = `agent:registry:${chainIdNum}:${tokenIdNum}`;
  await redis.set(
    registryKey,
    {
      agentId: bestReg.agentId,
      registeredAt: Date.now(),
      registeredBy: bestReg.current8004Owner || '',
      // Preserve the trusted registrant from the ownership-gated POST; a scan-path
      // rewrite must never erase it, or Scenario B verification is silently lost.
      ...(cachedRegistry?.registrantOwner ? { registrantOwner: cachedRegistry.registrantOwner } : {}),
      txHash: '',
    },
    verified ? undefined : { ex: 300 },
  );

  return {
    verified,
    currentNftOwner,
    agentId: bestReg.agentId,
    registeredBy: bestReg.current8004Owner || null,
    boundToBooa: boundViaBinding,
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
  const cachedRegistry = await redis.get<{ agentId: number; registeredBy?: string; registrantOwner?: string; registeredAt?: number; txHash?: string }>(registryKey);

  // Load agent metadata
  const metadataKey = `agent:metadata:${chainIdNum}:${tokenIdNum}`;
  const entry = await redis.get<Record<string, unknown>>(metadataKey);

  // Resolve and verify registration (single pass — no duplicate RPC)
  const verification = await resolveAndVerify(tokenIdNum, chainIdNum, cachedRegistry);

  // Binding (ERC-8217 / Adapter8004): an agent whose on-chain owner is the adapter
  // contract is "Awakened" — bound to this NFT, with the current NFT holder as its
  // controller. registeredBy is the agent's on-chain owner (the adapter, when bound).
  // `bound` requires a binding we validated names BOOA + this tokenId (boundToBooa),
  // NOT merely "the agent's owner is the adapter" — a foreign ERC-721 bound through
  // the shared adapter also reads owner == adapter, which previously forged these.
  const adapterAddr = getAdapterAddress(chainIdNum);
  const bound = verification.boundToBooa;
  const bindingContract = bound ? adapterAddr : null;
  const controller = bound ? verification.currentNftOwner : null;

  // On-chain agent wallet: the controller sets it via adapter.setAgentWallet(agentId).
  // A runtime (e.g. the Hermes template) links itself by matching its own wallet here.
  let agentWallet: string | null = null;
  if (bound && adapterAddr && verification.agentId !== null) {
    try {
      const { createPublicClient, http, fallback } = await import('viem');
      const { CHAIN_CONFIG } = await import('@/types/agent');
      const chainEntry = Object.values(CHAIN_CONFIG).find(c => c.chainId === chainIdNum);
      if (chainEntry) {
        const client = createPublicClient({ transport: fallback(chainEntry.rpcUrls.map((u: string) => http(u))) });
        const w = (await client.readContract({
          address: adapterAddr,
          abi: [{ type: 'function', name: 'getAgentWallet', stateMutability: 'view', inputs: [{ name: 'agentId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }] }] as const,
          functionName: 'getAgentWallet',
          args: [BigInt(verification.agentId)],
        })) as string;
        if (w && w !== '0x0000000000000000000000000000000000000000') agentWallet = w.toLowerCase();
      }
    } catch { /* no agent wallet set (or read failed) — leave null */ }
  }

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
      bound,
      bindingContract,
      controller,
      agentWallet,
    }, {
      headers: { 'Cache-Control': 'public, max-age=300', ...rateLimitHeaders(rl) },
    });
  }

  // Build ERC-8004 registration JSON from metadata
  const agentFields = Object.fromEntries(
    Object.entries(entry).filter(([k]) => !k.startsWith('_'))
  );
  const agent = agentFields as unknown as BooaAgent;
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
    bound,
    bindingContract,
    controller,
    agentWallet,
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

  // Writes require a verified session (middleware injects x-siwe-address only after
  // a successful SIWE check). Without this anyone could rebind any token's cache.
  const sessionAddress = req.headers.get('x-siwe-address');
  if (!sessionAddress || !isValidAddress(sessionAddress)) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await req.json();
  const { address, registryAgentId, txHash } = body;

  if (!address || !isValidAddress(address)) {
    return NextResponse.json({ error: 'Invalid address' }, { status: 400 });
  }
  if (address.toLowerCase() !== sessionAddress.toLowerCase()) {
    return NextResponse.json({ error: 'Address mismatch' }, { status: 403 });
  }
  if (registryAgentId === undefined || !Number.isInteger(Number(registryAgentId))) {
    return NextResponse.json({ error: 'Invalid registryAgentId' }, { status: 400 });
  }
  if (!txHash || !isValidTxHash(txHash)) {
    return NextResponse.json({ error: 'Invalid txHash' }, { status: 400 });
  }

  // The cache key is "BOOA token N": only the wallet that actually owns BOOA #tokenId
  // may write it. Without this, the tx/agent checks below can be satisfied with an
  // attacker-authored agentURI whose nftOrigin names a victim's token, letting a
  // signed-in attacker poison any token's registry entry.
  const { ownsBooa } = await import('@/lib/server/nft-owner');
  if (!(await ownsBooa(sessionAddress, tokenIdNum, chainIdNum))) {
    return NextResponse.json({ error: 'You do not own this token' }, { status: 403 });
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

    const registryAddr = getRegistryAddress(chainIdNum);

    let verifiedAgentId: bigint | null = null;
    let verifiedOwner: string | null = null;

    for (const log of receipt.logs) {
      // Only the canonical registry may attest a registration. Any contract can
      // emit an identically-shaped Registered event.
      if (log.address.toLowerCase() !== registryAddr.toLowerCase()) continue;
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
    const { getV2Address } = await import('@/lib/contracts/booa-v2');
    const booaAddr = getV2Address(chainIdNum) || getV2Address(1);
    const adapterAddr = getAdapterAddress(chainIdNum);

    // Does this registration actually concern the token in the URL? Either the
    // agentURI declares it as its nftOrigin, or the adapter binds the agent to it.
    // Without this check one valid tx can be replayed onto every tokenId.
    let boundToPathToken = false;

    try {
      const uri = await client.readContract({
        address: registryAddr,
        abi: IDENTITY_REGISTRY_ABI,
        functionName: 'tokenURI',
        args: [verifiedAgentId],
      }) as string;
      if (uri.startsWith('data:')) {
        const parsed = JSON.parse(Buffer.from(uri.split(',')[1], 'base64').toString('utf-8'));
        if (Number(parsed?.nftOrigin?.tokenId) === tokenIdNum) boundToPathToken = true;
      }
    } catch { /* fall back to the binding check */ }

    const isAdapterOwner =
      !!adapterAddr && verifiedOwner.toLowerCase() === adapterAddr.toLowerCase();
    let isController = false;

    if (isAdapterOwner) {
      // ERC-8217: the agent is held by our canonical adapter and the caller is the
      // bound NFT holder. The binding must name the BOOA collection AND this tokenId.
      try {
        const binding = await client.readContract({
          address: adapterAddr as `0x${string}`,
          abi: [{
            type: 'function',
            name: 'bindingOf',
            stateMutability: 'view',
            inputs: [{ name: 'agentId', type: 'uint256' }],
            outputs: [{
              name: 'binding',
              type: 'tuple',
              components: [
                { name: 'standard', type: 'uint8' },
                { name: 'tokenContract', type: 'address' },
                { name: 'tokenId', type: 'uint256' },
              ],
            }],
          }] as const,
          functionName: 'bindingOf',
          args: [verifiedAgentId],
        }) as { standard: number; tokenContract: `0x${string}`; tokenId: bigint };

        const bindsThisToken =
          Number(binding.tokenId) === tokenIdNum &&
          !!booaAddr &&
          binding.tokenContract.toLowerCase() === booaAddr.toLowerCase();

        if (bindsThisToken) {
          boundToPathToken = true;
          const nftOwner = await client.readContract({
            address: binding.tokenContract,
            abi: [{
              type: 'function',
              name: 'ownerOf',
              stateMutability: 'view',
              inputs: [{ name: 'tokenId', type: 'uint256' }],
              outputs: [{ name: '', type: 'address' }],
            }] as const,
            functionName: 'ownerOf',
            args: [binding.tokenId],
          }) as string;
          if (nftOwner.toLowerCase() === address.toLowerCase()) isController = true;
        }
      } catch { /* binding unreadable — controller stays false */ }
    }

    const isDirectOwner = verifiedOwner.toLowerCase() === address.toLowerCase();
    if (!isDirectOwner && !isController) {
      return NextResponse.json({ error: 'owner mismatch' }, { status: 400 });
    }
    if (!boundToPathToken) {
      return NextResponse.json({ error: 'Registration does not match tokenId' }, { status: 400 });
    }
  } catch (err) {
    console.error('TX verification error:', err);
    return NextResponse.json({ error: 'Failed to verify transaction on-chain' }, { status: 500 });
  }

  // registrantOwner is a TRUSTED record: this write is reached only after the caller
  // proved (via the ownership gate above) they own BOOA #tokenId AND control the agent.
  // It is the one on-chain-backed fact that survives the agent's 8004 NFT being moved
  // to a separate agent wallet, so `registrantOwner === currentNftOwner` verifies the
  // recommended "transfer 8004 to agent wallet" flow while still dropping on NFT sale.
  const registryKey = `agent:registry:${chainIdNum}:${tokenIdNum}`;
  await redis.set(registryKey, {
    agentId: Number(registryAgentId),
    registeredAt: Date.now(),
    registeredBy: address.toLowerCase(),
    registrantOwner: address.toLowerCase(),
    txHash,
  });

  // Clean Bridge-adoption marker: written ONLY here (verified register via our
  // Bridge), never on a GET lookup — so counting these gives a precise "NFTs
  // registered on 8004 through BOOA" number, unlike the lookup-polluted cache key.
  await redis.set(`bridge:registered:${chainIdNum}:${tokenIdNum}`, {
    agentId: Number(registryAgentId),
    registeredBy: address.toLowerCase(),
    registeredAt: Date.now(),
    txHash,
  });

  return NextResponse.json({ ok: true }, { headers: rateLimitHeaders(rl) });
}
