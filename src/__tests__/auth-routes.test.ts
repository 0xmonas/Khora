import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──

const mockSession: Record<string, unknown> = {};
const mockSave = vi.fn();
const mockDestroy = vi.fn();

vi.mock('iron-session', () => ({
  getIronSession: vi.fn(async () => {
    return new Proxy(mockSession, {
      get(target, prop) {
        if (prop === 'save') return mockSave;
        if (prop === 'destroy') return mockDestroy;
        return target[prop as string];
      },
      set(target, prop, value) {
        target[prop as string] = value;
        return true;
      },
    });
  }),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({})),
}));

const mockGenerateSiweNonce = vi.fn(() => 'test-nonce-abc123');
const mockParseSiweMessage = vi.fn();
const mockVerifySiweMessage = vi.fn();

vi.mock('viem/siwe', () => ({
  generateSiweNonce: () => mockGenerateSiweNonce(),
  parseSiweMessage: (msg: string) => mockParseSiweMessage(msg),
  verifySiweMessage: (...args: unknown[]) => mockVerifySiweMessage(...args),
}));

vi.mock('viem', () => ({
  createPublicClient: vi.fn(() => ({})),
  http: vi.fn(),
}));

vi.mock('viem/chains', () => ({
  shape: { id: 360 },
  shapeSepolia: { id: 11011 },
  mainnet: { id: 1 },
  base: { id: 8453 },
  arbitrum: { id: 42161 },
  optimism: { id: 10 },
  polygon: { id: 137 },
  avalanche: { id: 43114 },
  bsc: { id: 56 },
  celo: { id: 42220 },
  gnosis: { id: 100 },
  scroll: { id: 534352 },
  linea: { id: 59144 },
  mantle: { id: 5000 },
}));

// ── Tests ──

describe('Auth Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockSession).forEach((key) => delete mockSession[key]);
  });

  describe('GET /api/auth/nonce', () => {
    it('should return a 32-char hex nonce and store it in session', async () => {
      const { GET } = await import('@/app/api/auth/nonce/route');

      const response = await GET();
      const body = await response.json();

      expect(body.nonce).toMatch(/^[0-9a-f]{32}$/);
      expect(mockSession.nonce).toBe(body.nonce);
      expect(mockSession.address).toBeUndefined();
      expect(mockSession.chainId).toBeUndefined();
      expect(mockSave).toHaveBeenCalledOnce();
    });

    it('should generate a fresh nonce on each request', async () => {
      const { GET } = await import('@/app/api/auth/nonce/route');

      const first = await (await GET()).json();
      const second = await (await GET()).json();

      expect(first.nonce).not.toBe(second.nonce);
    });

    it('should clear existing session data when requesting new nonce', async () => {
      mockSession.address = '0x1234';
      mockSession.chainId = 11011;

      const { GET } = await import('@/app/api/auth/nonce/route');

      await GET();

      expect(mockSession.address).toBeUndefined();
      expect(mockSession.chainId).toBeUndefined();
      expect(mockSession.nonce).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe('POST /api/auth/verify', () => {
    const validAddress = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
    const validMessage = 'test-siwe-message';
    const validSignature = '0xsig';

    function makeRequest(body: Record<string, unknown>, host = 'localhost:3000') {
      return new Request('http://localhost:3000/api/auth/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          host,
        },
        body: JSON.stringify(body),
      }) as unknown as import('next/server').NextRequest;
    }

    it('should return 400 if message or signature missing', async () => {
      const { POST } = await import('@/app/api/auth/verify/route');

      const res1 = await POST(makeRequest({ message: '', signature: '0xsig' }));
      expect(res1.status).toBe(400);

      const res2 = await POST(makeRequest({ message: 'msg', signature: '' }));
      expect(res2.status).toBe(400);
    });

    it('should return 400 if SIWE message is invalid (missing fields)', async () => {
      mockParseSiweMessage.mockReturnValue({ nonce: null, address: null, chainId: null });

      const { POST } = await import('@/app/api/auth/verify/route');
      const res = await POST(makeRequest({ message: validMessage, signature: validSignature }));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Invalid SIWE message');
    });

    it('should return 422 and burn the nonce if nonce does not match session', async () => {
      mockSession.nonce = 'session-nonce';
      mockParseSiweMessage.mockReturnValue({
        nonce: 'different-nonce',
        address: validAddress,
        chainId: 11011,
        domain: 'localhost:3000',
        uri: 'http://localhost:3000',
      });

      const { POST } = await import('@/app/api/auth/verify/route');
      const res = await POST(makeRequest({ message: validMessage, signature: validSignature }));

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toBe('Nonce mismatch');
      expect(mockSession.nonce).toBeUndefined();
    });

    it('should return 422 and burn the nonce for a disallowed domain', async () => {
      mockSession.nonce = 'test-nonce';
      mockParseSiweMessage.mockReturnValue({
        nonce: 'test-nonce',
        address: validAddress,
        chainId: 11011,
        domain: 'evil.com',
        uri: 'https://evil.com',
      });

      const { POST } = await import('@/app/api/auth/verify/route');
      const res = await POST(makeRequest({ message: validMessage, signature: validSignature }));

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toBe('Domain mismatch');
      expect(mockSession.nonce).toBeUndefined();
    });

    it('should return 422 if uri host is not allowlisted', async () => {
      mockSession.nonce = 'test-nonce';
      mockParseSiweMessage.mockReturnValue({
        nonce: 'test-nonce',
        address: validAddress,
        chainId: 11011,
        domain: 'booa.app',
        uri: 'https://evil.com',
      });

      const { POST } = await import('@/app/api/auth/verify/route');
      const res = await POST(makeRequest({ message: validMessage, signature: validSignature }));

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toBe('Domain mismatch');
    });

    it('should accept a booa.app domain and vercel preview uri', async () => {
      mockSession.nonce = 'test-nonce';
      mockParseSiweMessage.mockReturnValue({
        nonce: 'test-nonce',
        address: validAddress,
        chainId: 11011,
        domain: 'booa-git-preview.vercel.app',
        uri: 'https://booa-git-preview.vercel.app',
      });
      mockVerifySiweMessage.mockResolvedValue(true);

      const { POST } = await import('@/app/api/auth/verify/route');
      const res = await POST(makeRequest({ message: validMessage, signature: validSignature }));

      expect(res.status).toBe(200);
    });

    it('should accept the www.booa.app apex-with-www domain', async () => {
      mockSession.nonce = 'test-nonce';
      mockParseSiweMessage.mockReturnValue({
        nonce: 'test-nonce',
        address: validAddress,
        chainId: 11011,
        domain: 'www.booa.app',
        uri: 'https://www.booa.app',
      });
      mockVerifySiweMessage.mockResolvedValue(true);

      const { POST } = await import('@/app/api/auth/verify/route');
      const res = await POST(makeRequest({ message: validMessage, signature: validSignature }));

      expect(res.status).toBe(200);
    });

    it('should return 422 for a localhost-prefixed lookalike domain', async () => {
      mockSession.nonce = 'test-nonce';
      mockParseSiweMessage.mockReturnValue({
        nonce: 'test-nonce',
        address: validAddress,
        chainId: 11011,
        domain: 'localhost.evil.com',
        uri: 'https://localhost.evil.com',
      });

      const { POST } = await import('@/app/api/auth/verify/route');
      const res = await POST(makeRequest({ message: validMessage, signature: validSignature }));

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toBe('Domain mismatch');
    });

    it('should return 400 and burn the nonce if chain is unsupported', async () => {
      mockSession.nonce = 'test-nonce';
      mockParseSiweMessage.mockReturnValue({
        nonce: 'test-nonce',
        address: validAddress,
        chainId: 999,
        domain: 'localhost:3000',
        uri: 'http://localhost:3000',
      });

      const { POST } = await import('@/app/api/auth/verify/route');
      const res = await POST(makeRequest({ message: validMessage, signature: validSignature }));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Unsupported chain');
      expect(mockSession.nonce).toBeUndefined();
    });

    it('should return 401 and burn the nonce if signature is invalid', async () => {
      mockSession.nonce = 'test-nonce';
      mockParseSiweMessage.mockReturnValue({
        nonce: 'test-nonce',
        address: validAddress,
        chainId: 11011,
        domain: 'localhost:3000',
        uri: 'http://localhost:3000',
      });
      mockVerifySiweMessage.mockResolvedValue(false);

      const { POST } = await import('@/app/api/auth/verify/route');
      const res = await POST(makeRequest({ message: validMessage, signature: validSignature }));

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Invalid signature');
      expect(mockSession.nonce).toBeUndefined();
    });

    it('should reject a message with an expired expirationTime', async () => {
      mockSession.nonce = 'test-nonce';
      const parsed = {
        nonce: 'test-nonce',
        address: validAddress,
        chainId: 11011,
        domain: 'localhost:3000',
        uri: 'http://localhost:3000',
        expirationTime: new Date(Date.now() - 60 * 1000),
      };
      mockParseSiweMessage.mockReturnValue(parsed);
      mockVerifySiweMessage.mockImplementation(() =>
        Promise.resolve(new Date() < parsed.expirationTime),
      );

      const { POST } = await import('@/app/api/auth/verify/route');
      const res = await POST(makeRequest({ message: validMessage, signature: validSignature }));

      expect(res.status).toBe(401);
      expect(mockSession.nonce).toBeUndefined();
    });

    it('should create session on valid verification', async () => {
      mockSession.nonce = 'test-nonce';
      mockParseSiweMessage.mockReturnValue({
        nonce: 'test-nonce',
        address: validAddress,
        chainId: 11011,
        domain: 'localhost:3000',
        uri: 'http://localhost:3000',
      });
      mockVerifySiweMessage.mockResolvedValue(true);

      const { POST } = await import('@/app/api/auth/verify/route');
      const res = await POST(makeRequest({ message: validMessage, signature: validSignature }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.address).toBe(validAddress);
      expect(body.chainId).toBe(11011);

      // Session should be updated
      expect(mockSession.address).toBe(validAddress);
      expect(mockSession.chainId).toBe(11011);
      expect(mockSession.nonce).toBeUndefined();
      expect(mockSave).toHaveBeenCalledOnce();
    });

    it('should support Shape mainnet (chain 360)', async () => {
      mockSession.nonce = 'test-nonce';
      mockParseSiweMessage.mockReturnValue({
        nonce: 'test-nonce',
        address: validAddress,
        chainId: 360,
        domain: 'localhost:3000',
        uri: 'http://localhost:3000',
      });
      mockVerifySiweMessage.mockResolvedValue(true);

      const { POST } = await import('@/app/api/auth/verify/route');
      const res = await POST(makeRequest({ message: validMessage, signature: validSignature }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.chainId).toBe(360);
    });

    it('should return 500 on unexpected error', async () => {
      mockParseSiweMessage.mockImplementation(() => {
        throw new Error('parse failure');
      });

      const { POST } = await import('@/app/api/auth/verify/route');
      const res = await POST(makeRequest({ message: validMessage, signature: validSignature }));

      expect(res.status).toBe(500);
    });
  });

  describe('GET /api/auth/session', () => {
    it('should return null address when not authenticated', async () => {
      const { GET } = await import('@/app/api/auth/session/route');

      const response = await GET();
      const body = await response.json();

      expect(body.address).toBeNull();
      expect(body.chainId).toBeNull();
    });

    it('should return session data when authenticated', async () => {
      mockSession.address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
      mockSession.chainId = 11011;

      const { GET } = await import('@/app/api/auth/session/route');

      const response = await GET();
      const body = await response.json();

      expect(body.address).toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
      expect(body.chainId).toBe(11011);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should destroy the session', async () => {
      mockSession.address = '0x1234';
      mockSession.chainId = 11011;

      const { POST } = await import('@/app/api/auth/logout/route');

      const response = await POST();
      const body = await response.json();

      expect(body.ok).toBe(true);
      expect(mockDestroy).toHaveBeenCalledOnce();
    });
  });
});
