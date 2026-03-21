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

const MAX_REGISTRATION_SIZE = 100_000; // 100KB max for on-chain/IPFS registration data

/** Sanitize registration JSON — enforce size limits on individual fields without stripping unknown fields */
function sanitizeRegistration(raw: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(raw)) {
    // Block prototype pollution
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;

    // Truncate long strings
    if (typeof val === 'string') {
      result[key] = val.slice(0, key === 'image' ? 50_000 : 2000);
    }
    // Cap arrays
    else if (Array.isArray(val)) {
      result[key] = val.slice(0, 50).map((item: unknown) => {
        if (typeof item === 'string') return item.slice(0, 2000);
        if (typeof item === 'object' && item !== null) {
          // Sanitize nested objects (e.g. services array items)
          const nested: Record<string, unknown> = {};
          for (const [nk, nv] of Object.entries(item as Record<string, unknown>)) {
            if (nk === '__proto__' || nk === 'constructor' || nk === 'prototype') continue;
            if (typeof nv === 'string') nested[nk] = nv.slice(0, 2000);
            else if (Array.isArray(nv)) nested[nk] = nv.slice(0, 20).filter((v): v is string => typeof v === 'string').map(v => v.slice(0, 200));
            else nested[nk] = nv;
          }
          return nested;
        }
        return item;
      });
    }
    // Pass through booleans, numbers, simple objects
    else if (typeof val === 'boolean' || typeof val === 'number') {
      result[key] = val;
    }
    // Shallow objects (e.g. supportedTrust)
    else if (typeof val === 'object' && val !== null) {
      const serialized = JSON.stringify(val);
      if (serialized.length <= 10_000) {
        result[key] = val;
      }
    }
  }

  return result;
}

async function fetchRegistration(agentURI: string) {
  let registration;

  // Handle data URIs
  if (agentURI.startsWith('data:')) {
    const base64 = agentURI.split(',')[1];
    const json = Buffer.from(base64, 'base64').toString('utf-8');
    if (json.length > MAX_REGISTRATION_SIZE) {
      throw new Error('Registration data too large');
    }
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

    const text = await response.text();
    if (text.length > MAX_REGISTRATION_SIZE) {
      throw new Error('Registration data too large');
    }
    registration = JSON.parse(text);
  }

  // endpoints → services migration (ERC-8004 Jan 2026)
  if (registration.endpoints && !registration.services) {
    registration.services = registration.endpoints;
    delete registration.endpoints;
  }

  return sanitizeRegistration(registration);
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
