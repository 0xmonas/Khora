import { NextRequest, NextResponse } from 'next/server';
import { CHAIN_CONFIG, IDENTITY_REGISTRY_ADDRESS } from '@/types/agent';
import type { SupportedChain, DiscoveredAgent } from '@/types/agent';

export const maxDuration = 30;

// Multicall3 — deployed at the same address on all EVM chains
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as const;

const REGISTRY_ABI = [
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Find the highest minted tokenId using two multicall rounds.
 * Round 1: Sparse probe — check every 1000th ID from 1000..100000 (100 calls, 1 multicall)
 * Round 2: Dense probe — scan the 1000-ID range after the highest hit (1000 calls, 1 multicall)
 * Tolerates gaps (burned tokens) via allowFailure.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findMaxTokenId(client: any): Promise<number> {
  const MAX_CEILING = 100_000;
  const COARSE_STEP = 1000;

  // Round 1: Sparse probe — one multicall with 100 checkpoints
  const coarseIds: number[] = [];
  for (let id = COARSE_STEP; id <= MAX_CEILING; id += COARSE_STEP) {
    coarseIds.push(id);
  }

  const coarseContracts = coarseIds.map((id) => ({
    address: IDENTITY_REGISTRY_ADDRESS as `0x${string}`,
    abi: REGISTRY_ABI,
    functionName: 'ownerOf' as const,
    args: [BigInt(id)],
  }));

  const coarseResults = await client.multicall({
    contracts: coarseContracts,
    multicallAddress: MULTICALL3,
    allowFailure: true,
  });

  let highestCoarse = 0;
  coarseResults.forEach((r: { status: string }, i: number) => {
    if (r.status === 'success') {
      highestCoarse = Math.max(highestCoarse, coarseIds[i]);
    }
  });

  // If nothing found at any 1000-step checkpoint, check small range 1..COARSE_STEP
  if (highestCoarse === 0) {
    const smallContracts = [];
    for (let id = 1; id <= COARSE_STEP; id++) {
      smallContracts.push({
        address: IDENTITY_REGISTRY_ADDRESS as `0x${string}`,
        abi: REGISTRY_ABI,
        functionName: 'ownerOf' as const,
        args: [BigInt(id)],
      });
    }
    const smallResults = await client.multicall({
      contracts: smallContracts,
      multicallAddress: MULTICALL3,
      allowFailure: true,
    });
    let maxSmall = 0;
    smallResults.forEach((r: { status: string }, i: number) => {
      if (r.status === 'success') maxSmall = Math.max(maxSmall, i + 1);
    });
    return maxSmall;
  }

  // Round 2: Dense probe — scan highestCoarse..highestCoarse+COARSE_STEP
  const denseStart = highestCoarse;
  const denseEnd = Math.min(highestCoarse + COARSE_STEP, MAX_CEILING);
  const denseContracts = [];
  for (let id = denseStart; id <= denseEnd; id++) {
    denseContracts.push({
      address: IDENTITY_REGISTRY_ADDRESS as `0x${string}`,
      abi: REGISTRY_ABI,
      functionName: 'ownerOf' as const,
      args: [BigInt(id)],
    });
  }

  const denseResults = await client.multicall({
    contracts: denseContracts,
    multicallAddress: MULTICALL3,
    allowFailure: true,
  });

  let maxId = highestCoarse;
  denseResults.forEach((r: { status: string }, i: number) => {
    if (r.status === 'success') {
      maxId = Math.max(maxId, denseStart + i);
    }
  });

  return maxId;
}

/** Extract agent name from a data URI. Returns null for HTTP/IPFS URIs. */
function extractNameFromDataURI(uri: string): string | null {
  if (!uri.startsWith('data:')) return null;
  try {
    const base64 = uri.split(',')[1];
    const json = Buffer.from(base64, 'base64').toString('utf-8');
    return JSON.parse(json).name || null;
  } catch {
    return null;
  }
}

/**
 * Scan tokenIds via parallel multicall waves with early termination.
 * Scans from newest to oldest (high→low) so we find recent registrations first.
 */
async function scanOwnedTokenIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any,
  maxTokenId: number,
  targetAddress: string,
  expectedBalance: number,
): Promise<number[]> {
  const BATCH_SIZE = 1000;
  const CONCURRENT = 8;
  const ownedIds: number[] = [];

  // Build batches from HIGH to LOW (newest tokens first)
  const batches: { start: number; end: number }[] = [];
  for (let end = maxTokenId; end >= 1; end -= BATCH_SIZE) {
    batches.push({ start: Math.max(1, end - BATCH_SIZE + 1), end });
  }

  for (let w = 0; w < batches.length; w += CONCURRENT) {
    // Early termination: found all expected tokens
    if (ownedIds.length >= expectedBalance) break;

    const wave = batches.slice(w, w + CONCURRENT);
    const waveResults = await Promise.allSettled(
      wave.map(async ({ start, end }) => {
        const contracts = [];
        for (let id = start; id <= end; id++) {
          contracts.push({
            address: IDENTITY_REGISTRY_ADDRESS as `0x${string}`,
            abi: REGISTRY_ABI,
            functionName: 'ownerOf' as const,
            args: [BigInt(id)],
          });
        }
        const results = await client.multicall({
          contracts,
          multicallAddress: MULTICALL3,
          allowFailure: true,
        });
        const found: number[] = [];
        results.forEach((result: { status: string; result?: string }, index: number) => {
          if (result.status === 'success') {
            if ((result.result as string).toLowerCase() === targetAddress.toLowerCase()) {
              found.push(start + index);
            }
          }
        });
        return found;
      }),
    );

    for (const result of waveResults) {
      if (result.status === 'fulfilled') {
        ownedIds.push(...result.value);
      }
    }
  }

  return ownedIds.sort((a, b) => a - b);
}

/** Discover all agents owned by `address` on a single chain. */
async function discoverOnChain(
  chain: SupportedChain,
  address: string,
): Promise<{ agents: DiscoveredAgent[]; error?: string }> {
  const config = CHAIN_CONFIG[chain];
  const { createPublicClient, http, fallback } = await import('viem');
  const client = createPublicClient({
    transport: fallback(config.rpcUrls.map((url) => http(url))),
  });
  try {
    // Step 1: Quick balance check — skip chain if 0
    const balance = await client.readContract({
      address: IDENTITY_REGISTRY_ADDRESS,
      abi: REGISTRY_ABI,
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    });

    const expectedBalance = Number(balance);
    if (expectedBalance === 0) {
      return { agents: [] };
    }

    // Step 2: Find max tokenId via multicall probe
    const maxTokenId = await findMaxTokenId(client);
    if (maxTokenId === 0) return { agents: [] };

    // Step 3: Parallel multicall scan with early termination
    const ownedIds = await scanOwnedTokenIds(client, maxTokenId, address, expectedBalance);
    if (ownedIds.length === 0) return { agents: [] };

    // Step 4: Batch tokenURI for owned tokens
    const uriContracts = ownedIds.map((id) => ({
      address: IDENTITY_REGISTRY_ADDRESS as `0x${string}`,
      abi: REGISTRY_ABI,
      functionName: 'tokenURI' as const,
      args: [BigInt(id)],
    }));

    const uriResults = await client.multicall({
      contracts: uriContracts,
      multicallAddress: MULTICALL3,
      allowFailure: true,
    });

    const agents: DiscoveredAgent[] = [];
    uriResults.forEach((result: { status: string; result?: string }, index: number) => {
      const tokenId = ownedIds[index];
      if (result.status === 'success') {
        const uri = (result.result as string) || '';
        const hasMetadata = !!uri;
        agents.push({ chain, chainName: config.name, tokenId, name: uri ? extractNameFromDataURI(uri) : null, hasMetadata });
      } else {
        agents.push({ chain, chainName: config.name, tokenId, name: null, hasMetadata: false });
      }
    });

    return { agents };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { agents: [], error: `${config.name}: ${message.slice(0, 100)}` };
  }
}

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get('address');

  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return NextResponse.json(
      { error: 'Invalid or missing address parameter' },
      { status: 400 },
    );
  }

  const chains = Object.keys(CHAIN_CONFIG) as SupportedChain[];

  // Query all chains in parallel
  const results = await Promise.allSettled(
    chains.map((chain) => discoverOnChain(chain, address)),
  );

  const agents: DiscoveredAgent[] = [];
  const errors: { chain: SupportedChain; message: string }[] = [];

  results.forEach((result, index) => {
    const chain = chains[index];
    if (result.status === 'fulfilled') {
      agents.push(...result.value.agents);
      if (result.value.error) {
        errors.push({ chain, message: result.value.error });
      }
    } else {
      errors.push({ chain, message: result.reason?.message || 'Chain query failed' });
    }
  });

  // Sort: agents with metadata first, then by chain, then by tokenId
  agents.sort((a, b) => {
    if (a.hasMetadata !== b.hasMetadata) return a.hasMetadata ? -1 : 1;
    if (a.chainName !== b.chainName) return a.chainName.localeCompare(b.chainName);
    return a.tokenId - b.tokenId;
  });

  return NextResponse.json({ agents, errors, totalCount: agents.length });
}
