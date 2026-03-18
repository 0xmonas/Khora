import { NextRequest, NextResponse } from 'next/server';
import { validateInput } from '@/lib/api/api-helpers';
import { isSafeURL, safeFetch } from '@/lib/api/safe-fetch';
import { fetchAgentSchema } from '@/lib/validation/schemas';
import { CHAIN_CONFIG } from '@/types/agent';
import type { SupportedChain } from '@/types/agent';
import { getRegistryAddress } from '@/lib/contracts/identity-registry';

function getRegistryForChain(chain: string): `0x${string}` {
  const chainId = CHAIN_CONFIG[chain as SupportedChain]?.chainId;
  if (!chainId) return getRegistryAddress(1); // fallback to mainnet
  return getRegistryAddress(chainId);
}

export const maxDuration = 30;

// Minimal ERC-721 ABI — only tokenURI
const ERC721_ABI = [
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

async function callTokenURI(chain: SupportedChain, agentId: number): Promise<string> {
  const { createPublicClient, http, fallback } = await import('viem');
  const config = CHAIN_CONFIG[chain];
  const client = createPublicClient({
    transport: fallback(config.rpcUrls.map((url) => http(url))),
  });

  const agentURI = await client.readContract({
    address: getRegistryForChain(chain),
    abi: ERC721_ABI,
    functionName: 'tokenURI',
    args: [BigInt(agentId)],
  });

  return agentURI as string;
}

async function fetchRegistration(agentURI: string) {
  let registration;

  // Handle data URIs
  if (agentURI.startsWith('data:')) {
    const base64 = agentURI.split(',')[1];
    const json = Buffer.from(base64, 'base64').toString('utf-8');
    registration = JSON.parse(json);
  } else {
    // Handle IPFS URIs
    let url = agentURI;
    if (url.startsWith('ipfs://')) {
      url = `https://ipfs.io/ipfs/${url.slice(7)}`;
    }
    if (url.startsWith('ar://')) {
      url = `https://arweave.net/${url.slice(5)}`;
    }

    // SSRF protection: only fetch safe external URLs
    if (!isSafeURL(url)) {
      throw new Error('Blocked: URI points to a disallowed destination');
    }

    const response = await safeFetch(url, 10000);
    if (!response.ok) {
      throw new Error(`Failed to fetch registration: ${response.status}`);
    }

    registration = await response.json();
  }

  // endpoints → services migration (ERC-8004 Jan 2026)
  if (registration.endpoints && !registration.services) {
    registration.services = registration.endpoints;
    delete registration.endpoints;
  }

  return registration;
}

export async function POST(request: NextRequest) {
  try {
    const result = await validateInput(request, fetchAgentSchema);
    if ('error' in result) return result.error;

    const { chain, agentId } = result.data;

    // Call on-chain registry
    const agentURI = await callTokenURI(chain, agentId);
    if (!agentURI) {
      return NextResponse.json(
        { error: 'Agent not found or has no URI set' },
        { status: 404 }
      );
    }

    // Fetch off-chain registration JSON
    const registration = await fetchRegistration(agentURI);

    if (!registration.name) {
      return NextResponse.json(
        { error: 'Invalid registration data: missing name' },
        { status: 422 }
      );
    }

    return NextResponse.json({ registration }, {
      headers: { 'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300' },
    });
  } catch (error) {
    console.error('fetch-agent error:', error);
    const message = error instanceof Error ? error.message : '';

    if (message.includes('execution reverted') || message.includes('revert')) {
      return NextResponse.json(
        { error: 'Agent ID not found on this chain' },
        { status: 404 }
      );
    }

    return NextResponse.json({ error: 'Failed to fetch agent' }, { status: 500 });
  }
}
