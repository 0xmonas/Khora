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

// Mock rate limiter
vi.mock('@/lib/ratelimit', () => ({
  generalLimiter: { limit: vi.fn(() => ({ success: true, limit: 60, remaining: 59, reset: Date.now() + 60000 })) },
  writeLimiter: { limit: vi.fn(() => ({ success: true, limit: 10, remaining: 9, reset: Date.now() + 60000 })) },
  getIP: vi.fn(() => '127.0.0.1'),
  rateLimitHeaders: vi.fn(() => ({})),
}));

// Mock BOOA contracts
vi.mock('@/lib/contracts/booa-v2', () => ({
  getV2Address: () => '0x7aecA981734d133d3f695937508C48483BA6b654',
  getV2ChainId: () => 360,
  BOOA_V2_ABI: [],
}));

vi.mock('@/lib/contracts/identity-registry', () => ({
  getRegistryAddress: () => '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  IDENTITY_REGISTRY_MAINNET: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
  IDENTITY_REGISTRY_ABI: [],
}));

vi.mock('@/lib/contracts/booa', () => ({
  BOOA_NFT_ABI: [],
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

describe('Ownership Transfer: agent-registry GET', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockRedisStore).forEach(key => delete mockRedisStore[key]);
  });

  it('returns registeredBy when registry data exists', async () => {
    mockRedisStore['agent:registry:360:42'] = {
      agentId: 100,
      registeredBy: '0xali1234567890abcdef1234567890abcdef12345678',
      registeredAt: Date.now(),
      txHash: '0xabc',
    };

    const { GET } = await import('@/app/api/agent-registry/[chainId]/[tokenId]/route');
    const req = new NextRequest('http://localhost/api/agent-registry/360/42');
    const res = await GET(req, { params: Promise.resolve({ chainId: '360', tokenId: '42' }) });
    const data = await res.json();

    expect(data.registeredBy).toBe('0xali1234567890abcdef1234567890abcdef12345678');
    expect(data.registrations).toHaveLength(1);
    expect(data.registrations[0].agentId).toBe(100);
  });

  it('returns registeredBy=null when registry data has no registeredBy field', async () => {
    mockRedisStore['agent:registry:360:42'] = {
      agentId: 100,
    };

    const { GET } = await import('@/app/api/agent-registry/[chainId]/[tokenId]/route');
    const req = new NextRequest('http://localhost/api/agent-registry/360/42');
    const res = await GET(req, { params: Promise.resolve({ chainId: '360', tokenId: '42' }) });
    const data = await res.json();

    expect(data.registeredBy).toBeNull();
    expect(data.registrations[0].agentId).toBe(100);
  });

  it('returns registeredBy with metadata when both exist', async () => {
    mockRedisStore['agent:registry:360:42'] = {
      agentId: 100,
      registeredBy: '0xali',
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
      _minter: '0xali',
    };

    const { GET } = await import('@/app/api/agent-registry/[chainId]/[tokenId]/route');
    const req = new NextRequest('http://localhost/api/agent-registry/360/42');
    const res = await GET(req, { params: Promise.resolve({ chainId: '360', tokenId: '42' }) });
    const data = await res.json();

    expect(data.registeredBy).toBe('0xali');
    expect(data.name).toBe('TestAgent');
  });

  it('returns 404 when no registry and no metadata exist', async () => {
    const { GET } = await import('@/app/api/agent-registry/[chainId]/[tokenId]/route');
    const req = new NextRequest('http://localhost/api/agent-registry/360/42');
    const res = await GET(req, { params: Promise.resolve({ chainId: '360', tokenId: '42' }) });

    expect(res.status).toBe(404);
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
});

describe('Ownership Transfer: scenario matrix', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockRedisStore).forEach(key => delete mockRedisStore[key]);
  });

  // Scenario: Ali minted, Ali registered on 8004, Ali still owns NFT
  it('original owner: NFT owner matches registeredBy', async () => {
    mockRedisStore['agent:registry:360:42'] = {
      agentId: 100,
      registeredBy: '0xali',
      registeredAt: Date.now(),
      txHash: '0xabc',
    };

    const { GET } = await import('@/app/api/agent-registry/[chainId]/[tokenId]/route');
    const req = new NextRequest('http://localhost/api/agent-registry/360/42');
    const res = await GET(req, { params: Promise.resolve({ chainId: '360', tokenId: '42' }) });
    const data = await res.json();

    // Platform should show: "Registered on ERC-8004 protocol"
    // because registeredBy === NFT owner (checked client-side)
    expect(data.registeredBy).toBe('0xali');
    expect(data.registrations[0].agentId).toBe(100);
  });

  // Scenario: Ali minted + registered, then sold NFT to Veli
  // Veli is now NFT owner, but 8004 still registered by Ali
  it('transferred NFT: registeredBy differs from new NFT owner', async () => {
    mockRedisStore['agent:registry:360:42'] = {
      agentId: 100,
      registeredBy: '0xali',
      registeredAt: Date.now(),
      txHash: '0xabc',
    };

    const { GET } = await import('@/app/api/agent-registry/[chainId]/[tokenId]/route');
    const req = new NextRequest('http://localhost/api/agent-registry/360/42');
    const res = await GET(req, { params: Promise.resolve({ chainId: '360', tokenId: '42' }) });
    const data = await res.json();

    // Client-side: Veli's address !== data.registeredBy
    // Platform should show: "Register as new owner" button
    const veliAddress = '0xveli';
    expect(data.registeredBy).toBe('0xali');
    expect(data.registeredBy).not.toBe(veliAddress);
  });

  // Scenario: Veli re-registers after buying the NFT
  // Redis key gets overwritten with Veli's data
  it('new owner re-registers: Redis updates to new owner', async () => {
    // Initial: Ali's registration
    mockRedisStore['agent:registry:360:42'] = {
      agentId: 100,
      registeredBy: '0xali',
      registeredAt: Date.now(),
      txHash: '0xabc',
    };

    // Veli re-registers (simulated Redis overwrite)
    mockRedisStore['agent:registry:360:42'] = {
      agentId: 200,
      registeredBy: '0xveli',
      registeredAt: Date.now(),
      txHash: '0xdef',
    };

    const { GET } = await import('@/app/api/agent-registry/[chainId]/[tokenId]/route');
    const req = new NextRequest('http://localhost/api/agent-registry/360/42');
    const res = await GET(req, { params: Promise.resolve({ chainId: '360', tokenId: '42' }) });
    const data = await res.json();

    // After re-register: registeredBy is now Veli
    expect(data.registeredBy).toBe('0xveli');
    expect(data.registrations[0].agentId).toBe(200);
  });

  // Scenario: NFT exists but was never registered on 8004
  it('unregistered NFT: no registry data, returns 404', async () => {
    const { GET } = await import('@/app/api/agent-registry/[chainId]/[tokenId]/route');
    const req = new NextRequest('http://localhost/api/agent-registry/360/42');
    const res = await GET(req, { params: Promise.resolve({ chainId: '360', tokenId: '42' }) });

    expect(res.status).toBe(404);
  });

  // Scenario: Old registration without registeredBy field (pre-migration data)
  it('legacy registration: no registeredBy field stored', async () => {
    mockRedisStore['agent:registry:360:42'] = {
      agentId: 50,
    };

    const { GET } = await import('@/app/api/agent-registry/[chainId]/[tokenId]/route');
    const req = new NextRequest('http://localhost/api/agent-registry/360/42');
    const res = await GET(req, { params: Promise.resolve({ chainId: '360', tokenId: '42' }) });
    const data = await res.json();

    // Legacy data: registeredBy is null
    // Client should treat as "unknown owner" and allow re-registration
    expect(data.registeredBy).toBeNull();
    expect(data.registrations[0].agentId).toBe(50);
  });
});
