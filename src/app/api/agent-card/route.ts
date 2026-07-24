import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, fallback } from 'viem';
import { shape, shapeSepolia, mainnet } from 'viem/chains';
import { CHAIN_CONFIG } from '@/types/agent';
import type { SupportedChain } from '@/types/agent';
import { getRegistryAddress, IDENTITY_REGISTRY_ABI } from '@/lib/contracts/identity-registry';
import { BOOA_V2_ABI, getV2Address } from '@/lib/contracts/booa-v2';
import { getAdapterAddress } from '@/lib/contracts/booa-adapter';
import { calculateAgentScores, type AgentScoreInput } from '@/utils/agent-score';
import { getRedis } from '@/lib/server/redis';

const BINDING_OF_ABI = [{
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

export const maxDuration = 30;

async function getAgentData(chain: SupportedChain, agentId: number) {
  const config = CHAIN_CONFIG[chain];
  const chainId = config.chainId;
  const registryAddress = getRegistryAddress(chainId);

  const client = createPublicClient({
    transport: fallback(config.rpcUrls.map((url) => http(url))),
  });

  // Fetch tokenURI and ownerOf in parallel
  const [agentURI, owner] = await Promise.all([
    client.readContract({
      address: registryAddress,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'tokenURI',
      args: [BigInt(agentId)],
    }) as Promise<string>,
    client.readContract({
      address: registryAddress,
      abi: IDENTITY_REGISTRY_ABI,
      functionName: 'ownerOf',
      args: [BigInt(agentId)],
    }) as Promise<string>,
  ]);

  return { agentURI, owner, chainId, registryAddress };
}

function parseAgentURI(agentURI: string): Record<string, unknown> {
  if (agentURI.startsWith('data:')) {
    const base64 = agentURI.split(',')[1];
    const json = Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(json);
  }
  throw new Error('Only data URIs supported for agent cards');
}

export async function GET(request: NextRequest) {
  const chain = request.nextUrl.searchParams.get('chain') as SupportedChain;
  const agentIdStr = request.nextUrl.searchParams.get('agentId');

  if (!chain || !CHAIN_CONFIG[chain]) {
    return NextResponse.json({ error: 'Invalid chain' }, { status: 400 });
  }
  if (!agentIdStr || !Number.isInteger(Number(agentIdStr)) || Number(agentIdStr) < 0) {
    return NextResponse.json({ error: 'Invalid agentId' }, { status: 400 });
  }

  const agentId = Number(agentIdStr);

  try {
    const { agentURI, owner, chainId } = await getAgentData(chain, agentId);

    if (!agentURI) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
    }

    const registration = parseAgentURI(agentURI);

    // endpoints → services migration
    if (registration.endpoints && !registration.services) {
      registration.services = registration.endpoints;
      delete registration.endpoints;
    }

    const services = (registration.services as { name: string; endpoint?: string; skills?: string[]; domains?: string[] }[]) || [];
    const allSkills = new Set<string>();
    const allDomains = new Set<string>();
    for (const svc of services) {
      for (const s of svc.skills || []) allSkills.add(s);
      for (const d of svc.domains || []) allDomains.add(d);
    }

    // Build score input
    const scoreInput: AgentScoreInput = {
      name: (registration.name as string) || null,
      description: (registration.description as string) || null,
      skills: Array.from(allSkills),
      domains: Array.from(allDomains),
      services,
      x402Support: (registration.x402Support as boolean) || false,
      supportedTrust: (registration.supportedTrust as string[]) || [],
      chainCount: 1, // single chain for now
      hasImage: !!(registration.image as string),
      personality: [],
      boundaries: [],
    };

    const scores = calculateAgentScores(scoreInput);

    // Verify against on-chain facts only (see the three arms below).
    let verified = false;
    let currentNftOwner: string | null = null;
    const nftOrigin = registration.nftOrigin as { tokenId?: number; originalOwner?: string; contract?: string } | undefined;

    if (nftOrigin?.tokenId !== undefined) {
      try {
        const booaContract = getV2Address(chainId);

        if (booaContract && booaContract.length > 2) {
          const booaChain = chainId === 1 ? mainnet : chainId === 360 ? shape : shapeSepolia;
          const booaClient = createPublicClient({ chain: booaChain, transport: http() });
          currentNftOwner = (await booaClient.readContract({
            address: booaContract,
            abi: BOOA_V2_ABI,
            functionName: 'ownerOf',
            args: [BigInt(nftOrigin.tokenId)],
          }) as string).toLowerCase();

          // Only on-chain facts count; nftOrigin.originalOwner is self-asserted and
          // can never prove ownership. Three sound arms:
          // 1) the agent's registry owner is the current NFT owner (self-hold / secondary),
          // 2) the agent is bound through our canonical adapter to this BOOA + tokenId (Awakened),
          // 3) the ownership-gated registrant is still the NFT owner (8004 moved to agent wallet).
          verified = owner.toLowerCase() === currentNftOwner;

          const adapterAddr = getAdapterAddress(chainId);
          if (!verified && adapterAddr && owner.toLowerCase() === adapterAddr.toLowerCase()) {
            try {
              const client = createPublicClient({
                transport: fallback(CHAIN_CONFIG[chain].rpcUrls.map((u) => http(u))),
              });
              const binding = await client.readContract({
                address: adapterAddr,
                abi: BINDING_OF_ABI,
                functionName: 'bindingOf',
                args: [BigInt(agentId)],
              }) as { standard: number; tokenContract: `0x${string}`; tokenId: bigint };
              if (
                Number(binding.tokenId) === nftOrigin.tokenId &&
                binding.tokenContract.toLowerCase() === booaContract.toLowerCase()
              ) {
                verified = true;
              }
            } catch { /* binding unreadable */ }
          }

          if (!verified) {
            try {
              const cached = await getRedis().get<{ agentId?: number; registrantOwner?: string }>(
                `agent:registry:${chainId}:${nftOrigin.tokenId}`,
              );
              // registrantOwner is trusted, but this endpoint is keyed by agentId while
              // nftOrigin.tokenId is self-asserted in the agent's URI. Bind the trusted
              // record to THIS agent — otherwise a hostile agent that merely names a
              // victim's registered token would inherit the victim's verified badge.
              if (
                cached?.registrantOwner &&
                cached.agentId === agentId &&
                cached.registrantOwner === currentNftOwner
              ) {
                verified = true;
              }
            } catch { /* cache unavailable */ }
          }
        }
      } catch { /* NFT lookup failed — leave verified false */ }
    }

    return NextResponse.json({
      agent: {
        id: agentId,
        chain,
        chainId,
        chainName: CHAIN_CONFIG[chain].name,
        owner,
        name: registration.name || `Agent #${agentId}`,
        description: registration.description || '',
        image: registration.image || '',
        services,
        skills: Array.from(allSkills),
        domains: Array.from(allDomains),
        x402Support: registration.x402Support || false,
        supportedTrust: registration.supportedTrust || [],
        active: registration.active || false,
        registrations: registration.registrations || [],
        verified,
        currentNftOwner,
      },
      scores,
    }, {
      headers: { 'Cache-Control': 'public, max-age=60' },
    });
  } catch (error) {
    console.error('agent-card error:', error);
    const message = error instanceof Error ? error.message : '';
    if (message.includes('execution reverted') || message.includes('revert')) {
      return NextResponse.json({ error: 'Agent not found on this chain' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to fetch agent' }, { status: 500 });
  }
}
