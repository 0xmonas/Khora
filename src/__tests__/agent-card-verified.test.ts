import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
const BOOA = '0x7aecA981734d133d3f695937508C48483BA6b654';
const ETH_BOOA = '0xbc48fD45aAaf6549293056606397D351a100b222';
const TESTNET_BOOA = '0x00000000000000000000000000000000000000Ee';

// Per-test knobs
let agentOwner = '0xagentwallet';        // registry ownerOf(agentId) — the 8004 owner
let nftOwner = '0xbob';                  // BOOA ownerOf(nftOrigin.tokenId) — currentNftOwner
let nftOriginTokenId = 42;               // self-asserted in the agent URI
let cacheEntry: { agentId?: number; registrantOwner?: string } | null = null;

const readContract = vi.fn(async ({ address, functionName }: { address: string; functionName: string }) => {
  if (functionName === 'tokenURI') {
    const json = { name: 'Agent', description: 'x', image: '', nftOrigin: { tokenId: nftOriginTokenId } };
    return `data:application/json;base64,${Buffer.from(JSON.stringify(json)).toString('base64')}`;
  }
  if (functionName === 'ownerOf') {
    if (address.toLowerCase() === REGISTRY.toLowerCase()) return agentOwner;
    if (address.toLowerCase() === BOOA.toLowerCase() || address.toLowerCase() === ETH_BOOA.toLowerCase()) return nftOwner;
    if (address.toLowerCase() === TESTNET_BOOA.toLowerCase()) return '0xstranger';
  }
  return null;
});

vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    createPublicClient: () => ({ readContract }),
    http: () => ({}),
    fallback: (t: unknown[]) => t[0],
  };
});
vi.mock('viem/chains', () => ({ mainnet: { id: 1 }, shape: { id: 360 }, shapeSepolia: { id: 11011 } }));

vi.mock('@/lib/contracts/identity-registry', () => ({
  getRegistryAddress: () => REGISTRY,
  IDENTITY_REGISTRY_ABI: [
    { name: 'ownerOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'a', type: 'uint256' }], outputs: [{ name: '', type: 'address' }] },
    { name: 'tokenURI', type: 'function', stateMutability: 'view', inputs: [{ name: 'a', type: 'uint256' }], outputs: [{ name: '', type: 'string' }] },
  ],
}));
vi.mock('@/lib/contracts/booa-v2', () => ({
  getV2Address: (id: number) => (id === 1 ? ETH_BOOA : id === 360 ? BOOA : TESTNET_BOOA),
  isBooaContract: (a: string) => [BOOA, ETH_BOOA].some((b) => b.toLowerCase() === a?.toLowerCase()),
  BOOA_V2_ABI: [{ name: 'ownerOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'a', type: 'uint256' }], outputs: [{ name: '', type: 'address' }] }],
}));
vi.mock('@/lib/contracts/booa-adapter', () => ({ getAdapterAddress: () => null }));
vi.mock('@/utils/agent-score', () => ({
  calculateAgentScores: () => ({ identity: 0, service: 0, trust: 0, reach: 0, overall: 0, rank: 'D' }),
}));

const mockGet = vi.fn(async () => cacheEntry);
vi.mock('@/lib/server/redis', () => ({ getRedis: () => ({ get: mockGet }) }));

async function callCard(agentId: number, chain = 'shape') {
  const { GET } = await import('@/app/api/agent-card/route');
  const req = new NextRequest(`http://localhost/api/agent-card?chain=${chain}&agentId=${agentId}`);
  const res = await GET(req);
  return res.json();
}

describe('agent-card verified — Scenario B registrantOwner arm', () => {
  beforeEach(() => {
    agentOwner = '0xagentwallet';
    nftOwner = '0xbob';
    nftOriginTokenId = 42;
    cacheEntry = null;
    vi.clearAllMocks();
  });

  it('verifies the real registrant when the 8004 agent was moved to an agent wallet', async () => {
    // Victim agent #312 for token 42; 8004 moved to agent wallet (owner != nftOwner),
    // trusted registrantOwner still equals the current NFT owner, and cache.agentId matches.
    cacheEntry = { agentId: 312, registrantOwner: '0xbob' };
    const data = await callCard(312);
    expect(data.agent.verified).toBe(true);
  });

  it('does NOT verify a hostile agent that merely names a victim\'s registered token', async () => {
    // Attacker agent #9999 authors nftOrigin.tokenId = 42 (the victim's token). The victim's
    // cache entry (agentId 312) must not confer verification on a different agentId.
    agentOwner = '0xattacker';
    cacheEntry = { agentId: 312, registrantOwner: '0xbob' };
    const data = await callCard(9999);
    expect(data.agent.verified).toBe(false);
  });

  it('does NOT verify once the NFT is sold (registrantOwner no longer the owner)', async () => {
    nftOwner = '0xcarol';                          // token 42 sold to Carol
    cacheEntry = { agentId: 312, registrantOwner: '0xbob' };
    const data = await callCard(312);
    expect(data.agent.verified).toBe(false);
  });
});

describe('agent-card verified — registry chains other than Ethereum and Shape', () => {
  beforeEach(() => {
    nftOriginTokenId = 42;
    cacheEntry = null;
    vi.clearAllMocks();
  });

  it('checks the BOOA owner on Ethereum, not a testnet contract, for an agent registered on Base', async () => {
    nftOwner = '0xbob';
    agentOwner = '0xbob';
    const body = await callCard(7, 'base');
    expect(body.agent.currentNftOwner).toBe('0xbob');
    expect(body.agent.verified).toBe(true);
  });
});
