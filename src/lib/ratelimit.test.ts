import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

// Mock Redis before importing ratelimit
const mockGet = vi.fn();
const mockIncr = vi.fn();
const mockDecr = vi.fn();
const mockExpire = vi.fn();
const mockDel = vi.fn();

vi.mock('@/lib/server/redis', () => ({
  getRedis: () => ({
    get: mockGet,
    incr: mockIncr,
    decr: mockDecr,
    expire: mockExpire,
    del: mockDel,
  }),
}));

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class MockRatelimit {
    static slidingWindow() { return {}; }
    limit = vi.fn().mockResolvedValue({ success: true, limit: 60, remaining: 59, reset: 0, pending: Promise.resolve() });
  },
}));

let checkChatQuota: Awaited<typeof import('./ratelimit')>['checkChatQuota'];
let CHAT_QUOTA_MAX: number;

beforeAll(async () => {
  const mod = await import('./ratelimit');
  checkChatQuota = mod.checkChatQuota;
  CHAT_QUOTA_MAX = mod.CHAT_QUOTA_MAX;
});

describe('Atomic quota checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkChatQuota', () => {
    it('allows when under chat limit', async () => {
      mockIncr.mockResolvedValue(10);

      const result = await checkChatQuota('0xabc');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(CHAT_QUOTA_MAX - 10);
    });

    it('blocks and rolls back when over chat limit', async () => {
      mockIncr.mockResolvedValue(CHAT_QUOTA_MAX + 1);

      const result = await checkChatQuota('0xabc');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(mockDecr).toHaveBeenCalledTimes(1);
    });

    it('sets TTL on first increment', async () => {
      mockIncr.mockResolvedValue(1);

      await checkChatQuota('0xabc');

      expect(mockExpire).toHaveBeenCalledTimes(1);
    });
  });
});
