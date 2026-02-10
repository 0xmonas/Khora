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
  base: { id: 8453 },
  baseSepolia: { id: 84532 },
}));

// ── Tests ──

describe('Auth Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockSession).forEach((key) => delete mockSession[key]);
  });

  describe('GET /api/auth/nonce', () => {
    it('should return a nonce and store it in session', async () => {
      const { GET } = await import('@/app/api/auth/nonce/route');

      const response = await GET();
      const body = await response.json();

      expect(body.nonce).toBe('test-nonce-abc123');
      expect(mockSession.nonce).toBe('test-nonce-abc123');
      expect(mockSession.address).toBeUndefined();
      expect(mockSession.chainId).toBeUndefined();
      expect(mockSave).toHaveBeenCalledOnce();
    });

    it('should clear existing session data when requesting new nonce', async () => {
      mockSession.address = '0x1234';
      mockSession.chainId = 84532;

      const { GET } = await import('@/app/api/auth/nonce/route');

      await GET();

      expect(mockSession.address).toBeUndefined();
      expect(mockSession.chainId).toBeUndefined();
      expect(mockSession.nonce).toBe('test-nonce-abc123');
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

    it('should return 422 if nonce does not match session', async () => {
      mockSession.nonce = 'session-nonce';
      mockParseSiweMessage.mockReturnValue({
        nonce: 'different-nonce',
        address: validAddress,
        chainId: 84532,
        domain: 'localhost:3000',
      });

      const { POST } = await import('@/app/api/auth/verify/route');
      const res = await POST(makeRequest({ message: validMessage, signature: validSignature }));

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toBe('Nonce mismatch');
    });

    it('should return 422 if domain does not match host', async () => {
      mockSession.nonce = 'test-nonce';
      mockParseSiweMessage.mockReturnValue({
        nonce: 'test-nonce',
        address: validAddress,
        chainId: 84532,
        domain: 'evil.com',
      });

      const { POST } = await import('@/app/api/auth/verify/route');
      const res = await POST(makeRequest({ message: validMessage, signature: validSignature }));

      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toBe('Domain mismatch');
    });

    it('should return 400 if chain is unsupported', async () => {
      mockSession.nonce = 'test-nonce';
      mockParseSiweMessage.mockReturnValue({
        nonce: 'test-nonce',
        address: validAddress,
        chainId: 999,
        domain: 'localhost:3000',
      });

      const { POST } = await import('@/app/api/auth/verify/route');
      const res = await POST(makeRequest({ message: validMessage, signature: validSignature }));

      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('Unsupported chain');
    });

    it('should return 401 if signature is invalid', async () => {
      mockSession.nonce = 'test-nonce';
      mockParseSiweMessage.mockReturnValue({
        nonce: 'test-nonce',
        address: validAddress,
        chainId: 84532,
        domain: 'localhost:3000',
      });
      mockVerifySiweMessage.mockResolvedValue(false);

      const { POST } = await import('@/app/api/auth/verify/route');
      const res = await POST(makeRequest({ message: validMessage, signature: validSignature }));

      expect(res.status).toBe(401);
      const body = await res.json();
      expect(body.error).toBe('Invalid signature');
    });

    it('should create session on valid verification', async () => {
      mockSession.nonce = 'test-nonce';
      mockParseSiweMessage.mockReturnValue({
        nonce: 'test-nonce',
        address: validAddress,
        chainId: 84532,
        domain: 'localhost:3000',
      });
      mockVerifySiweMessage.mockResolvedValue(true);

      const { POST } = await import('@/app/api/auth/verify/route');
      const res = await POST(makeRequest({ message: validMessage, signature: validSignature }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.address).toBe(validAddress);
      expect(body.chainId).toBe(84532);

      // Session should be updated
      expect(mockSession.address).toBe(validAddress);
      expect(mockSession.chainId).toBe(84532);
      expect(mockSession.nonce).toBeUndefined();
      expect(mockSave).toHaveBeenCalledOnce();
    });

    it('should support Base mainnet (chain 8453)', async () => {
      mockSession.nonce = 'test-nonce';
      mockParseSiweMessage.mockReturnValue({
        nonce: 'test-nonce',
        address: validAddress,
        chainId: 8453,
        domain: 'localhost:3000',
      });
      mockVerifySiweMessage.mockResolvedValue(true);

      const { POST } = await import('@/app/api/auth/verify/route');
      const res = await POST(makeRequest({ message: validMessage, signature: validSignature }));

      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.chainId).toBe(8453);
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
      mockSession.chainId = 84532;

      const { GET } = await import('@/app/api/auth/session/route');

      const response = await GET();
      const body = await response.json();

      expect(body.address).toBe('0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045');
      expect(body.chainId).toBe(84532);
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should destroy the session', async () => {
      mockSession.address = '0x1234';
      mockSession.chainId = 84532;

      const { POST } = await import('@/app/api/auth/logout/route');

      const response = await POST();
      const body = await response.json();

      expect(body.ok).toBe(true);
      expect(mockDestroy).toHaveBeenCalledOnce();
    });
  });
});
