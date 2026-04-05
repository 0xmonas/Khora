import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock Redis
const mockRedisStore: Record<string, unknown> = {};
const mockRedis = {
  get: vi.fn((key: string) => mockRedisStore[key] ?? null),
  set: vi.fn((key: string, value: unknown) => { mockRedisStore[key] = value; }),
  keys: vi.fn(() => Object.keys(mockRedisStore)),
  incr: vi.fn(() => 1),
};

vi.mock('@/lib/server/redis', () => ({
  getRedis: () => mockRedis,
}));

vi.mock('@/lib/ratelimit', () => ({
  generalLimiter: { limit: vi.fn(() => ({ success: true, limit: 60, remaining: 59, reset: Date.now() + 60000 })) },
  writeLimiter: { limit: vi.fn(() => ({ success: true, limit: 10, remaining: 9, reset: Date.now() + 60000 })) },
  getIP: vi.fn(() => '127.0.0.1'),
  rateLimitHeaders: vi.fn(() => ({})),
}));

// Mock contract reads — configurable per test
let mockNftOwner: string | null = '0xalice';
let mockTokenURI: string | null = null;

const mockReadContract = vi.fn(async ({ functionName }: { functionName: string }) => {
  if (functionName === 'ownerOf') {
    // Determine if this is BOOA NFT or 8004 registry call by args
    // BOOA uses tokenId, 8004 uses agentId — we differentiate by mock context
    return mockNftOwner;
  }
  if (functionName === 'tokenURI') {
    return mockTokenURI;
  }
  if (functionName === 'getSVG') {
    return '<svg></svg>';
  }
  return null;
});

const mockMulticall = vi.fn(async () => []);

vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    createPublicClient: () => ({
      readContract: mockReadContract,
      multicall: mockMulticall,
    }),
    http: () => ({}),
    fallback: (transports: unknown[]) => transports[0],
  };
});

vi.mock('viem/chains', () => ({
  shape: { id: 360 },
  shapeSepolia: { id: 11011 },
}));

vi.mock('@/lib/contracts/booa-v2', () => ({
  getV2Address: () => '0x7aecA981734d133d3f695937508C48483BA6b654',
  getV2ChainId: () => 360,
  BOOA_V2_ABI: [{ name: 'ownerOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }] }],
}));

vi.mock('@/lib/contracts/identity-registry', () => ({
  getRegistryAddress: () => '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  IDENTITY_REGISTRY_MAINNET: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  IDENTITY_REGISTRY_ABI: [
    { name: 'ownerOf', type: 'function', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'address' }] },
    { name: 'tokenURI', type: 'function', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'string' }] },
  ],
}));

vi.mock('@/lib/contracts/booa', () => ({
  BOOA_NFT_ABI: [{ name: 'getSVG', type: 'function' }],
  isMainnetChain: () => true,
}));

vi.mock('@/utils/helpers/exportFormats', () => ({
  toERC8004: (agent: Record<string, unknown>) => ({
    type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1',
    name: agent.name || 'Test',
    description: agent.description || '',
    image: '',
    services: [],
    active: false,
  }),
}));

vi.mock('@/types/agent', () => ({
  CHAIN_CONFIG: {
    shape: { chainId: 360, name: 'Shape', rpcUrls: ['https://rpc.shape.network'] },
  },
}));

// Set env vars for contract addresses
process.env.NEXT_PUBLIC_BOOA_V2_ADDRESS = '0x7aecA981734d133d3f695937508C48483BA6b654';
process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS = '0x7aecA981734d133d3f695937508C48483BA6b654';

describe('agent-registry GET: input validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockRedisStore).forEach(key => delete mockRedisStore[key]);
    mockNftOwner = '0xalice';
    mockTokenURI = null;
  });

  it('returns 400 for invalid chainId', async () => {
    const { GET } = await import('@/app/api/agent-registry/[chainId]/[tokenId]/route');
    const req = new NextRequest('http://localhost/api/agent-registry/999999/42');
    const res = await GET(req, { params: Promise.resolve({ chainId: '999999', tokenId: '42' }) });
    expect(res.status).toBe(400);
  });

  it('returns 400 for negative tokenId', async () => {
    const { GET } = await import('@/app/api/agent-registry/[chainId]/[tokenId]/route');
    const req = new NextRequest('http://localhost/api/agent-registry/360/-1');
    const res = await GET(req, { params: Promise.resolve({ chainId: '360', tokenId: '-1' }) });
    expect(res.status).toBe(400);
  });

  it('returns 404 when no registry and no metadata exist', async () => {
    const { GET } = await import('@/app/api/agent-registry/[chainId]/[tokenId]/route');
    const req = new NextRequest('http://localhost/api/agent-registry/360/42');
    const res = await GET(req, { params: Promise.resolve({ chainId: '360', tokenId: '42' }) });
    expect(res.status).toBe(404);
  });
});

describe('agent-registry GET: verified field', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockRedisStore).forEach(key => delete mockRedisStore[key]);
    mockNftOwner = '0xalice';
    mockTokenURI = null;
  });

  // Scenario 1: Alice registered, Alice still owns NFT
  it('returns verified:true when registeredBy matches NFT owner', async () => {
    mockNftOwner = '0xalice';

    mockRedisStore['agent:registry:360:0'] = {
      agentId: 47,
      registeredBy: '0xalice',
      registeredAt: Date.now(),
      txHash: '0xabc',
    };

    // Mock readContract to return appropriate values
    mockReadContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'ownerOf') return '0xalice';
      if (functionName === 'tokenURI') {
        const data = { nftOrigin: { tokenId: 0, originalOwner: '0xalice' } };
        return `data:application/json;base64,${Buffer.from(JSON.stringify(data)).toString('base64')}`;
      }
      if (functionName === 'getSVG') return '<svg></svg>';
      return null;
    });

    const { GET } = await import('@/app/api/agent-registry/[chainId]/[tokenId]/route');
    const req = new NextRequest('http://localhost/api/agent-registry/360/0');
    const res = await GET(req, { params: Promise.resolve({ chainId: '360', tokenId: '0' }) });
    const data = await res.json();

    expect(data.verified).toBe(true);
    expect(data.currentNftOwner).toBe('0xalice');
  });

  // Scenario 2: Alice registered, sold NFT to Bob — orphan
  it('returns verified:false when NFT sold but old registration remains', async () => {
    mockRedisStore['agent:registry:360:0'] = {
      agentId: 47,
      registeredBy: '0xalice',
      registeredAt: Date.now(),
      txHash: '0xabc',
    };

    // NFT now owned by Bob, but 8004 still Alice's
    let ownerCallCount = 0;
    mockReadContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'ownerOf') {
        ownerCallCount++;
        // First call: getNftOwner → Bob owns NFT
        if (ownerCallCount === 1) return '0xbob';
        // Second call: 8004 ownerOf → still Alice
        return '0xalice';
      }
      if (functionName === 'tokenURI') {
        const data = { nftOrigin: { tokenId: 0, originalOwner: '0xalice' } };
        return `data:application/json;base64,${Buffer.from(JSON.stringify(data)).toString('base64')}`;
      }
      if (functionName === 'getSVG') return '<svg></svg>';
      return null;
    });

    const { GET } = await import('@/app/api/agent-registry/[chainId]/[tokenId]/route');
    const req = new NextRequest('http://localhost/api/agent-registry/360/0');
    const res = await GET(req, { params: Promise.resolve({ chainId: '360', tokenId: '0' }) });
    const data = await res.json();

    // originalOwner (Alice) != NFT owner (Bob)
    // current8004Owner (Alice) != NFT owner (Bob)
    // Both checks fail → orphan
    expect(data.verified).toBe(false);
    expect(data.currentNftOwner).toBe('0xbob');
  });

  // Scenario 3: Bob registered, transferred 8004 to agent wallet
  it('returns verified:true when originalOwner matches NFT owner (agent wallet scenario)', async () => {
    mockRedisStore['agent:registry:360:0'] = {
      agentId: 312,
      registeredBy: '0xbob',
      registeredAt: Date.now(),
      txHash: '0xdef',
    };

    let callCount = 0;
    mockReadContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      callCount++;
      if (functionName === 'ownerOf') {
        // First call: getNftOwner → Bob owns the NFT
        if (callCount === 1) return '0xbob';
        // Second call: 8004 ownerOf → agent_wallet (transferred)
        return '0xagent_wallet';
      }
      if (functionName === 'tokenURI') {
        const data = { nftOrigin: { tokenId: 0, originalOwner: '0xbob' } };
        return `data:application/json;base64,${Buffer.from(JSON.stringify(data)).toString('base64')}`;
      }
      if (functionName === 'getSVG') return '<svg></svg>';
      return null;
    });

    const { GET } = await import('@/app/api/agent-registry/[chainId]/[tokenId]/route');
    const req = new NextRequest('http://localhost/api/agent-registry/360/0');
    const res = await GET(req, { params: Promise.resolve({ chainId: '360', tokenId: '0' }) });
    const data = await res.json();

    // originalOwner (Bob) == NFT owner (Bob) → verified
    expect(data.verified).toBe(true);
    expect(data.currentNftOwner).toBe('0xbob');
  });

  // Scenario 4: Both NFT + 8004 transferred to agent wallet
  it('returns verified:true when current8004Owner matches NFT owner (both transferred)', async () => {
    mockRedisStore['agent:registry:360:0'] = {
      agentId: 312,
      registeredBy: '0xbob',
      registeredAt: Date.now(),
      txHash: '0xdef',
    };

    mockReadContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'ownerOf') {
        // Both NFT and 8004 owned by agent_wallet
        return '0xagent_wallet';
      }
      if (functionName === 'tokenURI') {
        // originalOwner was Bob (before transfer)
        const data = { nftOrigin: { tokenId: 0, originalOwner: '0xbob' } };
        return `data:application/json;base64,${Buffer.from(JSON.stringify(data)).toString('base64')}`;
      }
      if (functionName === 'getSVG') return '<svg></svg>';
      return null;
    });

    const { GET } = await import('@/app/api/agent-registry/[chainId]/[tokenId]/route');
    const req = new NextRequest('http://localhost/api/agent-registry/360/0');
    const res = await GET(req, { params: Promise.resolve({ chainId: '360', tokenId: '0' }) });
    const data = await res.json();

    // originalOwner (Bob) != NFT owner (agent_wallet)
    // BUT current8004Owner (agent_wallet) == NFT owner (agent_wallet) → verified
    expect(data.verified).toBe(true);
    expect(data.currentNftOwner).toBe('0xagent_wallet');
  });

  it('returns registrations and registeredBy with metadata', async () => {
    mockRedisStore['agent:registry:360:42'] = {
      agentId: 100,
      registeredBy: '0xalice',
      registeredAt: Date.now(),
      txHash: '0xabc',
    };
    mockRedisStore['agent:metadata:360:42'] = {
      name: 'TestAgent',
      description: 'A test',
      creature: 'robot',
      vibe: 'chill',
      emoji: '🤖',
      personality: ['smart'],
      skills: [],
      domains: [],
      services: [],
      _minter: '0xalice',
    };

    mockReadContract.mockImplementation(async ({ functionName }: { functionName: string }) => {
      if (functionName === 'ownerOf') return '0xalice';
      if (functionName === 'tokenURI') {
        const data = { nftOrigin: { tokenId: 42, originalOwner: '0xalice' } };
        return `data:application/json;base64,${Buffer.from(JSON.stringify(data)).toString('base64')}`;
      }
      if (functionName === 'getSVG') return '<svg></svg>';
      return null;
    });

    const { GET } = await import('@/app/api/agent-registry/[chainId]/[tokenId]/route');
    const req = new NextRequest('http://localhost/api/agent-registry/360/42');
    const res = await GET(req, { params: Promise.resolve({ chainId: '360', tokenId: '42' }) });
    const data = await res.json();

    expect(data.name).toBe('TestAgent');
    expect(data.registrations[0].agentId).toBe(100);
    expect(data.verified).toBe(true);
  });
});
