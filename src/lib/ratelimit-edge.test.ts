import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { memoryLimit } from './ratelimit-edge';

vi.mock('@upstash/redis/cloudflare', () => ({
  Redis: class {
    constructor() {}
  },
}));

vi.mock('@upstash/ratelimit', () => ({
  Ratelimit: class {
    static slidingWindow() {
      return {};
    }
    constructor() {}
  },
}));

describe('memoryLimit (degraded-mode fallback)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('allows requests up to the ceiling', () => {
    const key = `k-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      expect(memoryLimit(key, 5).success).toBe(true);
    }
  });

  it('blocks the request that exceeds the ceiling', () => {
    const key = `k-${Math.random()}`;
    for (let i = 0; i < 5; i++) memoryLimit(key, 5);
    expect(memoryLimit(key, 5).success).toBe(false);
  });

  it('keeps blocking while the window is still open', () => {
    const key = `k-${Math.random()}`;
    for (let i = 0; i < 6; i++) memoryLimit(key, 5);

    vi.advanceTimersByTime(30_000);
    expect(memoryLimit(key, 5).success).toBe(false);
  });

  it('allows again once the window has passed', () => {
    const key = `k-${Math.random()}`;
    for (let i = 0; i < 6; i++) memoryLimit(key, 5);

    vi.advanceTimersByTime(60_001);
    expect(memoryLimit(key, 5).success).toBe(true);
  });

  it('tracks each key independently', () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    for (let i = 0; i < 6; i++) memoryLimit(a, 5);

    expect(memoryLimit(a, 5).success).toBe(false);
    expect(memoryLimit(b, 5).success).toBe(true);
  });

  it('never fails open: a zero ceiling blocks immediately', () => {
    expect(memoryLimit(`z-${Math.random()}`, 0).success).toBe(false);
  });
});
