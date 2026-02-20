import { NextRequest, NextResponse } from 'next/server';
import { CHAIN_CONFIG } from '@/types/agent';
import type { SupportedChain } from '@/types/agent';
import { getRegistryAddress } from '@/lib/contracts/identity-registry';

const OWNER_OF_ABI = [
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export async function POST(request: NextRequest) {
  try {
    const { chain, agentId } = await request.json();

    if (!chain || !agentId) {
      return NextResponse.json({ error: 'Missing chain or agentId' }, { status: 400 });
    }

    const config = CHAIN_CONFIG[chain as SupportedChain];
    if (!config) {
      return NextResponse.json({ error: 'Invalid chain' }, { status: 400 });
    }

    const { createPublicClient, http, fallback } = await import('viem');
    const client = createPublicClient({
      transport: fallback(config.rpcUrls.map((url) => http(url))),
    });

    const registryAddress = getRegistryAddress(config.chainId);
    const owner = await client.readContract({
      address: registryAddress,
      abi: OWNER_OF_ABI,
      functionName: 'ownerOf',
      args: [BigInt(agentId)],
    });

    return NextResponse.json({ owner: owner as string });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to check ownership';

    if (message.includes('execution reverted') || message.includes('revert')) {
      return NextResponse.json({ error: 'Agent ID not found on this chain' }, { status: 404 });
    }

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
