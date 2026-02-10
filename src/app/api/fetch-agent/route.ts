import { NextRequest, NextResponse } from 'next/server';
import { validateInput } from '@/lib/api/api-helpers';
import { fetchAgentSchema } from '@/lib/validation/schemas';
import { CHAIN_CONFIG, IDENTITY_REGISTRY_ADDRESS } from '@/types/agent';
import type { SupportedChain } from '@/types/agent';

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
  const { createPublicClient, http } = await import('viem');
  const config = CHAIN_CONFIG[chain];

  const client = createPublicClient({
    transport: http(config.rpcUrl),
  });

  const agentURI = await client.readContract({
    address: IDENTITY_REGISTRY_ADDRESS,
    abi: ERC721_ABI,
    functionName: 'tokenURI',
    args: [BigInt(agentId)],
  });

  return agentURI as string;
}

async function fetchRegistration(agentURI: string) {
  // Handle data URIs
  if (agentURI.startsWith('data:')) {
    const base64 = agentURI.split(',')[1];
    const json = Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(json);
  }

  // Handle IPFS URIs
  let url = agentURI;
  if (url.startsWith('ipfs://')) {
    url = `https://ipfs.io/ipfs/${url.slice(7)}`;
  }

  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) {
    throw new Error(`Failed to fetch registration: ${response.status}`);
  }

  return response.json();
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

    return NextResponse.json({ registration });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch agent';

    // Provide user-friendly error for common issues
    if (message.includes('execution reverted') || message.includes('revert')) {
      return NextResponse.json(
        { error: 'Agent ID not found on this chain' },
        { status: 404 }
      );
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
