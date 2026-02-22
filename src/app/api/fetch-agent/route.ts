import { NextRequest, NextResponse } from 'next/server';
import { validateInput } from '@/lib/api/api-helpers';
import { fetchAgentSchema } from '@/lib/validation/schemas';
import { CHAIN_CONFIG } from '@/types/agent';
import type { SupportedChain } from '@/types/agent';
import { IDENTITY_REGISTRY_MAINNET, IDENTITY_REGISTRY_TESTNET } from '@/lib/contracts/identity-registry';

const TESTNET_CHAINS: string[] = ['base-sepolia'];

function getRegistryForChain(chain: string): `0x${string}` {
  return TESTNET_CHAINS.includes(chain) ? IDENTITY_REGISTRY_TESTNET : IDENTITY_REGISTRY_MAINNET;
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

/** Block SSRF: only allow https://, ipfs:// gateway, and ar:// gateway URLs */
function isSafeURL(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Only HTTPS allowed
    if (parsed.protocol !== 'https:') return false;
    // Block internal/private IPs and metadata endpoints
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.') ||
      hostname.startsWith('192.168.') ||
      hostname === '169.254.169.254' ||       // AWS metadata
      hostname.endsWith('.internal') ||
      hostname.endsWith('.local') ||
      hostname === '[::1]'
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
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

    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
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
