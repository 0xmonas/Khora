import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { NextRequest } from 'next/server';

// ── Mock Redis (in-memory) ──
const store = {
  sets: new Map<string, Set<string>>(),
  hashes: new Map<string, Map<string, string>>(),
  strings: new Map<string, unknown>(),
};

function resetStore() {
  store.sets.clear();
  store.hashes.clear();
  store.strings.clear();
}

const mockRedis = {
  scard: vi.fn((key: string) => store.sets.get(key)?.size ?? 0),
  sadd: vi.fn((key: string, value: string) => {
    if (!store.sets.has(key)) store.sets.set(key, new Set());
    const set = store.sets.get(key)!;
    if (set.has(value)) return 0;
    set.add(value);
    return 1;
  }),
  sismember: vi.fn((key: string, value: string) => {
    return store.sets.get(key)?.has(value) ? 1 : 0;
  }),
  smembers: vi.fn((key: string) => {
    return Array.from(store.sets.get(key) ?? []);
  }),
  hget: vi.fn((key: string, field: string) => {
    return store.hashes.get(key)?.get(field) ?? null;
  }),
  hset: vi.fn((key: string, obj: Record<string, string>) => {
    if (!store.hashes.has(key)) store.hashes.set(key, new Map());
    const hash = store.hashes.get(key)!;
    for (const [k, v] of Object.entries(obj)) hash.set(k, v);
  }),
  hgetall: vi.fn((key: string) => {
    const hash = store.hashes.get(key);
    if (!hash || hash.size === 0) return null;
    return Object.fromEntries(hash);
  }),
  get: vi.fn((key: string) => store.strings.get(key) ?? null),
  set: vi.fn((key: string, value: unknown) => { store.strings.set(key, value); }),
  del: vi.fn((key: string) => {
    store.strings.delete(key);
    store.sets.delete(key);
    store.hashes.delete(key);
  }),
};

vi.mock('@/lib/server/redis', () => ({
  getRedis: () => mockRedis,
}));

// ── Mock Turnstile (always pass) ──
vi.mock('@/lib/turnstile', () => ({
  verifyTurnstile: vi.fn().mockResolvedValue(true),
}));

// ── Mock viem balance check — 0 ETH by default ──
let mockBalance = BigInt(0);

vi.mock('viem', async () => {
  const actual = await vi.importActual('viem');
  return {
    ...actual,
    createPublicClient: () => ({
      getBalance: vi.fn().mockImplementation(() => Promise.resolve(mockBalance)),
    }),
  };
});

// ── Mock env ──
process.env.WAITLIST_ADMIN_SECRET = 'test-admin-secret';
process.env.TURNSTILE_SECRET_KEY = 'test-turnstile-secret';

// ── Import routes ──
let waitlistGET: (req: NextRequest) => Promise<Response>;
let waitlistPOST: (req: NextRequest) => Promise<Response>;
let adminGET: (req: NextRequest) => Promise<Response>;
let adminPOST: (req: NextRequest) => Promise<Response>;

beforeAll(async () => {
  const waitlist = await import('./route');
  waitlistGET = waitlist.GET;
  waitlistPOST = waitlist.POST;
  const admin = await import('./admin/route');
  adminGET = admin.GET;
  adminPOST = admin.POST;
});

// ── Helpers ──
function makeRequest(url: string, opts?: { method?: string; body?: unknown; headers?: Record<string, string> }) {
  const req = new NextRequest(new URL(url, 'http://localhost:3000'), {
    method: opts?.method ?? 'GET',
    ...(opts?.body ? { body: JSON.stringify(opts.body) } : {}),
    headers: {
      'Content-Type': 'application/json',
      ...opts?.headers,
    },
  });
  return req;
}

const ADMIN_HEADER = { authorization: 'Bearer test-admin-secret' };

function randomAddr(): string {
  const hex = Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `0x${hex}`;
}

function randomTweetUrl(): { url: string; handle: string } {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789_';
  const len = 4 + Math.floor(Math.random() * 11);
  const handle = Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  const statusId = Math.floor(Math.random() * 1e15).toString();
  return { url: `https://x.com/${handle}/status/${statusId}`, handle };
}

// ── Tests ──
describe('Waitlist System', () => {
  beforeEach(() => {
    resetStore();
    mockBalance = BigInt(0); // Default: 0 ETH
  });

  // ── Admin: Open/Close ──
  describe('Admin — open/close waitlist', () => {
    it('rejects unauthorized requests', async () => {
      const req = makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'open', durationHours: 48 },
      });
      const res = await adminPOST(req);
      expect(res.status).toBe(401);
    });

    it('opens waitlist for 48 hours', async () => {
      const req = makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'open', durationHours: 48 },
        headers: ADMIN_HEADER,
      });
      const res = await adminPOST(req);
      const data = await res.json();

      expect(data.ok).toBe(true);
      expect(data.closesAt).toBeDefined();

      const closesAt = new Date(data.closesAt).getTime();
      const now = Date.now();
      // Should close roughly 48h from now (within 5s tolerance)
      expect(closesAt - now).toBeGreaterThan(47 * 60 * 60 * 1000);
      expect(closesAt - now).toBeLessThan(49 * 60 * 60 * 1000);
    });

    it('closes waitlist', async () => {
      // Open first
      await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'open', durationHours: 1 },
        headers: ADMIN_HEADER,
      }));

      // Close
      const res = await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'close' },
        headers: ADMIN_HEADER,
      }));
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.closed).toBe(true);

      // Verify closed via public status
      const statusRes = await waitlistGET(makeRequest('/api/waitlist'));
      const statusData = await statusRes.json();
      expect(statusData.isOpen).toBe(false);
    });

    it('rejects invalid action', async () => {
      const res = await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'invalid' },
        headers: ADMIN_HEADER,
      }));
      expect(res.status).toBe(400);
    });
  });

  // ── Admin: Pause/Resume ──
  describe('Admin — pause/resume waitlist', () => {
    it('pauses an open waitlist and saves remaining time', async () => {
      // Open for 24 hours
      await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'open', durationHours: 24 },
        headers: ADMIN_HEADER,
      }));

      // Pause
      const res = await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'pause' },
        headers: ADMIN_HEADER,
      }));
      const data = await res.json();

      expect(data.ok).toBe(true);
      expect(data.paused).toBe(true);
      expect(data.remainingMs).toBeGreaterThan(0);
      // ~24h remaining (with tolerance)
      expect(data.remainingMs).toBeGreaterThan(23 * 60 * 60 * 1000);
    });

    it('blocks registration while paused', async () => {
      mockBalance = BigInt('5000000000000000');

      await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'open', durationHours: 24 },
        headers: ADMIN_HEADER,
      }));

      await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'pause' },
        headers: ADMIN_HEADER,
      }));

      const res = await waitlistPOST(makeRequest('/api/waitlist', {
        method: 'POST',
        body: { turnstileToken: 'tok', tweetUrl: 'https://x.com/alice/status/123456789' },
        headers: { 'x-siwe-address': randomAddr() },
      }));
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('paused');
    });

    it('public status shows isPaused=true and isOpen=false when paused', async () => {
      await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'open', durationHours: 24 },
        headers: ADMIN_HEADER,
      }));

      await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'pause' },
        headers: ADMIN_HEADER,
      }));

      const res = await waitlistGET(makeRequest('/api/waitlist'));
      const data = await res.json();
      expect(data.isOpen).toBe(false);
      expect(data.isPaused).toBe(true);
      expect(data.remainingMs).toBeGreaterThan(0);
    });

    it('resumes a paused waitlist with saved remaining time', async () => {
      await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'open', durationHours: 24 },
        headers: ADMIN_HEADER,
      }));

      // Pause — saves remaining
      const pauseRes = await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'pause' },
        headers: ADMIN_HEADER,
      }));
      const pauseData = await pauseRes.json();
      const savedRemaining = pauseData.remainingMs;

      // Resume
      const res = await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'resume' },
        headers: ADMIN_HEADER,
      }));
      const data = await res.json();

      expect(data.ok).toBe(true);
      expect(data.resumed).toBe(true);
      expect(data.remainingMs).toBe(savedRemaining);

      // Public status should show open again
      const statusRes = await waitlistGET(makeRequest('/api/waitlist'));
      const statusData = await statusRes.json();
      expect(statusData.isOpen).toBe(true);
      expect(statusData.isPaused).toBe(false);
    });

    it('allows registration after resume', async () => {
      mockBalance = BigInt('5000000000000000');

      await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'open', durationHours: 24 },
        headers: ADMIN_HEADER,
      }));

      await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'pause' },
        headers: ADMIN_HEADER,
      }));

      await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'resume' },
        headers: ADMIN_HEADER,
      }));

      const res = await waitlistPOST(makeRequest('/api/waitlist', {
        method: 'POST',
        body: { turnstileToken: 'tok', tweetUrl: 'https://x.com/bob/status/123456789' },
        headers: { 'x-siwe-address': randomAddr() },
      }));
      const data = await res.json();
      expect(data.ok).toBe(true);
    });

    it('rejects pause when waitlist is not open', async () => {
      const res = await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'pause' },
        headers: ADMIN_HEADER,
      }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('not open');
    });

    it('rejects double pause', async () => {
      await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'open', durationHours: 24 },
        headers: ADMIN_HEADER,
      }));

      await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'pause' },
        headers: ADMIN_HEADER,
      }));

      const res = await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'pause' },
        headers: ADMIN_HEADER,
      }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('already paused');
    });

    it('rejects resume when not paused', async () => {
      await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'open', durationHours: 24 },
        headers: ADMIN_HEADER,
      }));

      const res = await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'resume' },
        headers: ADMIN_HEADER,
      }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('not paused');
    });

    it('admin export shows paused state in meta', async () => {
      await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'open', durationHours: 24 },
        headers: ADMIN_HEADER,
      }));

      await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'pause' },
        headers: ADMIN_HEADER,
      }));

      const res = await adminGET(makeRequest('/api/waitlist/admin', {
        headers: ADMIN_HEADER,
      }));
      const data = await res.json();
      expect(data.meta).toBeTruthy();
      expect(data.meta.paused).toBe(true);
      expect(data.meta.remainingMs).toBeGreaterThan(0);
    });
  });

  // ── Public: Status check ──
  describe('GET /api/waitlist — status', () => {
    it('returns closed status when no meta exists', async () => {
      const res = await waitlistGET(makeRequest('/api/waitlist'));
      const data = await res.json();

      expect(data.isOpen).toBe(false);
      expect(data.count).toBe(0);
      expect(data.registered).toBe(false);
    });

    it('returns open status after admin opens', async () => {
      await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'open', durationHours: 48 },
        headers: ADMIN_HEADER,
      }));

      const res = await waitlistGET(makeRequest('/api/waitlist'));
      const data = await res.json();

      expect(data.isOpen).toBe(true);
      expect(data.closesAt).not.toBeNull();
    });

    it('checks registration status for specific address', async () => {
      const addr = randomAddr();
      // Manually add to store
      store.sets.set('waitlist:addresses', new Set([addr]));

      const res = await waitlistGET(makeRequest(`/api/waitlist?address=${addr}`));
      const data = await res.json();
      expect(data.registered).toBe(true);
    });
  });

  // ── Registration with 0 ETH balance ──
  describe('POST /api/waitlist — registration (0 ETH balance)', () => {
    beforeEach(async () => {
      // Open waitlist
      await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'open', durationHours: 48 },
        headers: ADMIN_HEADER,
      }));
    });

    it('rejects when waitlist is closed', async () => {
      // Close it first
      await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'close' },
        headers: ADMIN_HEADER,
      }));

      const res = await waitlistPOST(makeRequest('/api/waitlist', {
        method: 'POST',
        body: { turnstileToken: 'tok', tweetUrl: 'https://x.com/alice/status/123456789' },
        headers: { 'x-siwe-address': randomAddr() },
      }));
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('closed');
    });

    it('rejects without SIWE auth', async () => {
      const res = await waitlistPOST(makeRequest('/api/waitlist', {
        method: 'POST',
        body: { turnstileToken: 'tok', tweetUrl: 'https://x.com/alice/status/123456789' },
      }));
      expect(res.status).toBe(401);
    });

    it('rejects without turnstile token', async () => {
      const res = await waitlistPOST(makeRequest('/api/waitlist', {
        method: 'POST',
        body: { tweetUrl: 'https://x.com/alice/status/123' },
        headers: { 'x-siwe-address': randomAddr() },
      }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('captcha');
    });

    it('rejects without tweet URL', async () => {
      const res = await waitlistPOST(makeRequest('/api/waitlist', {
        method: 'POST',
        body: { turnstileToken: 'tok' },
        headers: { 'x-siwe-address': randomAddr() },
      }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Tweet URL');
    });

    it('rejects invalid tweet URL', async () => {
      const res = await waitlistPOST(makeRequest('/api/waitlist', {
        method: 'POST',
        body: { turnstileToken: 'tok', tweetUrl: 'https://facebook.com/alice' },
        headers: { 'x-siwe-address': randomAddr() },
      }));
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toContain('Invalid tweet URL');
    });

    it('rejects when balance is 0 ETH', async () => {
      mockBalance = BigInt(0);

      const res = await waitlistPOST(makeRequest('/api/waitlist', {
        method: 'POST',
        body: { turnstileToken: 'tok', tweetUrl: 'https://x.com/alice/status/123456789' },
        headers: { 'x-siwe-address': randomAddr() },
      }));
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error).toContain('0.005 ETH');
    });

    it('allows registration when balance >= 0.005 ETH', async () => {
      mockBalance = BigInt('5000000000000000'); // exactly 0.005 ETH

      const addr = randomAddr();
      const { url } = randomTweetUrl();

      const res = await waitlistPOST(makeRequest('/api/waitlist', {
        method: 'POST',
        body: { turnstileToken: 'tok', tweetUrl: url },
        headers: { 'x-siwe-address': addr },
      }));
      const data = await res.json();

      expect(data.ok).toBe(true);
      expect(data.alreadyRegistered).toBe(false);
      expect(data.count).toBe(1);
    });

    it('accepts both x.com and twitter.com URLs', async () => {
      mockBalance = BigInt('10000000000000000'); // 0.01 ETH

      const res = await waitlistPOST(makeRequest('/api/waitlist', {
        method: 'POST',
        body: { turnstileToken: 'tok', tweetUrl: 'https://twitter.com/MyHandle/status/999' },
        headers: { 'x-siwe-address': randomAddr() },
      }));
      const data = await res.json();
      expect(data.ok).toBe(true);
    });

    it('marks duplicate wallet as alreadyRegistered', async () => {
      mockBalance = BigInt('5000000000000000');
      const addr = randomAddr();

      // First registration
      await waitlistPOST(makeRequest('/api/waitlist', {
        method: 'POST',
        body: { turnstileToken: 'tok', tweetUrl: randomTweetUrl().url },
        headers: { 'x-siwe-address': addr },
      }));

      // Second registration — same wallet
      const res = await waitlistPOST(makeRequest('/api/waitlist', {
        method: 'POST',
        body: { turnstileToken: 'tok', tweetUrl: randomTweetUrl().url },
        headers: { 'x-siwe-address': addr },
      }));
      const data = await res.json();
      expect(data.ok).toBe(true);
      expect(data.alreadyRegistered).toBe(true);
      expect(data.count).toBe(1); // Still 1
    });

    it('rejects duplicate handle from different wallet (same username in URL)', async () => {
      mockBalance = BigInt('5000000000000000');
      const handle = 'shareduser';

      // First wallet registers
      await waitlistPOST(makeRequest('/api/waitlist', {
        method: 'POST',
        body: { turnstileToken: 'tok', tweetUrl: `https://x.com/${handle}/status/111` },
        headers: { 'x-siwe-address': randomAddr() },
      }));

      // Second wallet tries same handle
      const res = await waitlistPOST(makeRequest('/api/waitlist', {
        method: 'POST',
        body: { turnstileToken: 'tok', tweetUrl: `https://x.com/${handle}/status/222` },
        headers: { 'x-siwe-address': randomAddr() },
      }));
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toContain('already registered');
    });
  });

  // ── Full flow: register multiple wallets + export ──
  describe('Full flow — register + export', () => {
    const wallets: { addr: string; handle: string }[] = [];

    beforeEach(async () => {
      mockBalance = BigInt('5000000000000000');
      wallets.length = 0;

      // Open waitlist
      await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'open', durationHours: 48 },
        headers: ADMIN_HEADER,
      }));

      // Register 5 random wallets
      for (let i = 0; i < 5; i++) {
        const addr = randomAddr();
        const { url, handle } = randomTweetUrl();
        wallets.push({ addr, handle });

        await waitlistPOST(makeRequest('/api/waitlist', {
          method: 'POST',
          body: { turnstileToken: 'tok', tweetUrl: url },
          headers: { 'x-siwe-address': addr },
        }));
      }
    });

    it('registers all 5 wallets', async () => {
      const res = await waitlistGET(makeRequest('/api/waitlist'));
      const data = await res.json();
      expect(data.count).toBe(5);
    });

    it('each wallet shows as registered', async () => {
      for (const w of wallets) {
        const res = await waitlistGET(makeRequest(`/api/waitlist?address=${w.addr}`));
        const data = await res.json();
        expect(data.registered).toBe(true);
      }
    });

    it('admin export returns all addresses + twitter handles', async () => {
      const res = await adminGET(makeRequest('/api/waitlist/admin', {
        headers: ADMIN_HEADER,
      }));
      const data = await res.json();

      expect(data.count).toBe(5);
      expect(data.addresses).toHaveLength(5);
      expect(data.entries).toHaveLength(5);

      // Every entry should have a twitter handle
      for (const entry of data.entries) {
        expect(entry.address).toBeTruthy();
        expect(entry.twitter).toMatch(/^@[a-z0-9_]+$/);
      }

      // Verify our wallets are in the export
      for (const w of wallets) {
        expect(data.addresses).toContain(w.addr.toLowerCase());
        const entry = data.entries.find((e: { address: string }) => e.address === w.addr.toLowerCase());
        expect(entry).toBeTruthy();
        // w.handle is "xyz" (from URL), Redis stores "xyz", export returns "@xyz"
        expect(entry.twitter).toBe(`@${w.handle}`);
      }
    });

    it('admin export rejects unauthorized request', async () => {
      const res = await adminGET(makeRequest('/api/waitlist/admin'));
      expect(res.status).toBe(401);
    });

    it('unregistered address shows registered=false', async () => {
      const newAddr = randomAddr();
      const res = await waitlistGET(makeRequest(`/api/waitlist?address=${newAddr}`));
      const data = await res.json();
      expect(data.registered).toBe(false);
    });
  });

  // ── Balance edge cases ──
  describe('Balance checks', () => {
    beforeEach(async () => {
      await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'open', durationHours: 1 },
        headers: ADMIN_HEADER,
      }));
    });

    it('rejects at 0.0049 ETH (just below minimum)', async () => {
      mockBalance = BigInt('4900000000000000'); // 0.0049 ETH

      const res = await waitlistPOST(makeRequest('/api/waitlist', {
        method: 'POST',
        body: { turnstileToken: 'tok', tweetUrl: randomTweetUrl().url },
        headers: { 'x-siwe-address': randomAddr() },
      }));
      expect(res.status).toBe(403);
    });

    it('allows at exactly 0.005 ETH', async () => {
      mockBalance = BigInt('5000000000000000');

      const res = await waitlistPOST(makeRequest('/api/waitlist', {
        method: 'POST',
        body: { turnstileToken: 'tok', tweetUrl: randomTweetUrl().url },
        headers: { 'x-siwe-address': randomAddr() },
      }));
      const data = await res.json();
      expect(data.ok).toBe(true);
    });

    it('allows at 1 ETH', async () => {
      mockBalance = BigInt('1000000000000000000');

      const res = await waitlistPOST(makeRequest('/api/waitlist', {
        method: 'POST',
        body: { turnstileToken: 'tok', tweetUrl: randomTweetUrl().url },
        headers: { 'x-siwe-address': randomAddr() },
      }));
      const data = await res.json();
      expect(data.ok).toBe(true);
    });
  });

  // ── Tweet URL validation ──
  describe('Tweet URL validation', () => {
    beforeEach(async () => {
      mockBalance = BigInt('5000000000000000');
      await adminPOST(makeRequest('/api/waitlist/admin', {
        method: 'POST',
        body: { action: 'open', durationHours: 1 },
        headers: ADMIN_HEADER,
      }));
    });

    const validUrls = [
      'https://x.com/alice/status/1234567890',
      'https://twitter.com/Bob_123/status/9876543210',
      'https://x.com/_test/status/111/',
      'https://twitter.com/a/status/222?s=20',
      'https://x.com/max15characters/status/333',
    ];

    const invalidUrls = [
      '',
      'https://x.com/alice',
      'https://facebook.com/alice/status/123',
      'https://x.com/alice/status/',
      'not-a-url',
      'https://x.com/way_too_long_handle_name/status/123',
    ];

    for (const url of validUrls) {
      it(`accepts valid URL: "${url}"`, async () => {
        const res = await waitlistPOST(makeRequest('/api/waitlist', {
          method: 'POST',
          body: { turnstileToken: 'tok', tweetUrl: url },
          headers: { 'x-siwe-address': randomAddr() },
        }));
        const data = await res.json();
        expect(data.ok).toBe(true);
      });
    }

    for (const url of invalidUrls) {
      it(`rejects invalid URL: "${url || '(empty)'}"`, async () => {
        const res = await waitlistPOST(makeRequest('/api/waitlist', {
          method: 'POST',
          body: { turnstileToken: 'tok', tweetUrl: url },
          headers: { 'x-siwe-address': randomAddr() },
        }));
        expect(res.status).toBeGreaterThanOrEqual(400);
      });
    }
  });
});
