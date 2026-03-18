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

let checkGenerationQuota: Awaited<typeof import('./ratelimit')>['checkGenerationQuota'];
let checkDailyCap: Awaited<typeof import('./ratelimit')>['checkDailyCap'];
let checkChatQuota: Awaited<typeof import('./ratelimit')>['checkChatQuota'];
let GEN_QUOTA_MAX: number;
let DAILY_CAP_MAX: number;
let CHAT_QUOTA_MAX: number;

beforeAll(async () => {
  const mod = await import('./ratelimit');
  checkGenerationQuota = mod.checkGenerationQuota;
  checkDailyCap = mod.checkDailyCap;
  checkChatQuota = mod.checkChatQuota;
  GEN_QUOTA_MAX = mod.GEN_QUOTA_MAX;
  DAILY_CAP_MAX = mod.DAILY_CAP_MAX;
  CHAT_QUOTA_MAX = mod.CHAT_QUOTA_MAX;
});

describe('Atomic quota checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkGenerationQuota', () => {
    it('allows and increments atomically when under limit', async () => {
      mockIncr.mockResolvedValue(1);

      const result = await checkGenerationQuota('0xabc');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(GEN_QUOTA_MAX - 1);
      expect(mockIncr).toHaveBeenCalledTimes(1);
      expect(mockExpire).toHaveBeenCalledTimes(1);
      expect(mockDecr).not.toHaveBeenCalled();
    });

    it('blocks and rolls back when over limit', async () => {
      mockIncr.mockResolvedValue(GEN_QUOTA_MAX + 1);

      const result = await checkGenerationQuota('0xabc');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(mockDecr).toHaveBeenCalledTimes(1);
    });

    it('allows at exact limit (last allowed request)', async () => {
      mockIncr.mockResolvedValue(GEN_QUOTA_MAX);

      const result = await checkGenerationQuota('0xabc');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(0);
      expect(mockDecr).not.toHaveBeenCalled();
    });

    it('only sets TTL on first increment (newCount === 1)', async () => {
      mockIncr.mockResolvedValue(3);

      await checkGenerationQuota('0xabc');

      expect(mockExpire).not.toHaveBeenCalled();
    });
  });

  describe('checkDailyCap', () => {
    it('allows when under daily cap', async () => {
      mockIncr.mockResolvedValue(100);

      const result = await checkDailyCap();

      expect(result.allowed).toBe(true);
      expect(result.count).toBe(100);
    });

    it('blocks and rolls back when over daily cap', async () => {
      mockIncr.mockResolvedValue(DAILY_CAP_MAX + 1);

      const result = await checkDailyCap();

      expect(result.allowed).toBe(false);
      expect(mockDecr).toHaveBeenCalledTimes(1);
    });
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
