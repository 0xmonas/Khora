import { NextRequest, NextResponse } from 'next/server';
import { CHAIN_CONFIG } from '@/types/agent';
import type { SupportedChain } from '@/types/agent';
import { getRegistryAddress } from '@/lib/contracts/identity-registry';
import { IDENTITY_REGISTRY_ABI } from '@/lib/contracts/identity-registry';
import { calculateAgentScores, type AgentScoreInput } from '@/utils/agent-score';

export const maxDuration = 30;

async function getAgentData(chain: SupportedChain, agentId: number) {
  const { createPublicClient, http, fallback } = await import('viem');
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
