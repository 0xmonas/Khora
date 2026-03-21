import { Ratelimit } from '@upstash/ratelimit';
import { getRedis } from '@/lib/server/redis';

const redis = getRedis();

/**
 * General API rate limiter: 60 requests per 60 seconds per IP.
 * Sliding window algorithm for smooth limiting.
 */
export const generalLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(60, '60 s'),
  prefix: 'rl:general',
});

/**
 * Rate limiter for write operations (POST/DELETE): 30 per 60s per IP.
 */
export const writeLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '60 s'),
  prefix: 'rl:write',
});

/**
 * AI generation rate limiter: 5 per 60 seconds per IP.
 */
export const generationLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '60 s'),
  prefix: 'rl:generation',
});

/**
 * Rate limiter for CPU-heavy operations (img2boa): 10 per 60s per IP.
 */
export const heavyLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '60 s'),
  prefix: 'rl:heavy',
});

/**
 * Helper to extract IP from Next.js request.
 * On Vercel, x-forwarded-for is rewritten to contain ONLY the real client IP
 * (external IPs are not forwarded), so spoofing is not possible.
 */
export function getIP(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}

/**
 * Returns rate limit headers for the response.
 */
export function rateLimitHeaders(result: { limit: number; remaining: number; reset: number }) {
  return {
    'X-RateLimit-Limit': result.limit.toString(),
    'X-RateLimit-Remaining': result.remaining.toString(),
    'X-RateLimit-Reset': result.reset.toString(),
  };
}

/**
 * Per-wallet AI generation quota.
 * Prevents a single wallet from generating unlimited images after committing.
 */
const GEN_QUOTA_PREFIX = 'gen:wallet:';
export const GEN_QUOTA_MAX = 6; // ) 3 mint + 3 error margin
const GEN_QUOTA_TTL = 24 * 60 * 60; // 1 day (no commit deadline in V2, shorter TTL)

/**
 * Atomically check AND increment generation quota in a single INCR call.
 * Returns whether this request is allowed and the remaining count.
 * The INCR-first pattern prevents race conditions from parallel requests.
 */
export async function checkGenerationQuota(address: string): Promise<{ allowed: boolean; remaining: number }> {
  const key = `${GEN_QUOTA_PREFIX}${address.toLowerCase()}`;
  // Atomic: increment first, then check if over limit
  const newCount = await redis.incr(key);
  // Set TTL on first increment (atomic with pipeline would be ideal, but this is safe:
  // worst case a key without TTL gets an extra TTL set on next request)
  if (newCount === 1) {
    await redis.expire(key, GEN_QUOTA_TTL);
  }
  if (newCount > GEN_QUOTA_MAX) {
    // Over limit — roll back the increment
    await redis.decr(key);
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: Math.max(0, GEN_QUOTA_MAX - newCount) };
}

export async function resetGenerationQuota(address: string): Promise<void> {
  const key = `${GEN_QUOTA_PREFIX}${address.toLowerCase()}`;
  await redis.del(key);
}

/**
 * Refund one generation quota slot (e.g. when AI call fails after quota was incremented).
 * Uses DECR but never goes below 0.
 */
export async function refundGenerationQuota(address: string): Promise<void> {
  const key = `${GEN_QUOTA_PREFIX}${address.toLowerCase()}`;
  const val = await redis.decr(key);
  if (val < 0) await redis.set(key, 0); // safety: never go negative
}

/**
 * Refund one daily cap slot (e.g. when AI call fails after cap was incremented).
 */
export async function refundDailyCap(): Promise<void> {
  const val = await redis.decr(DAILY_CAP_KEY);
  if (val < 0) await redis.set(DAILY_CAP_KEY, 0);
}

/**
 * Global daily generation cap — hard spending limit.
 * Prevents runaway costs regardless of per-wallet or per-IP limits.
 * Resets daily via TTL (86400s from first increment).
 */
const DAILY_CAP_KEY = 'gen:daily:global';
export const DAILY_CAP_MAX = 5000; // max 5000 generations/day = ~$250/day

/**
 * Atomically check AND increment daily cap in a single INCR call.
 */
export async function checkDailyCap(): Promise<{ allowed: boolean; count: number }> {
  const newCount = await redis.incr(DAILY_CAP_KEY);
  if (newCount === 1) {
    await redis.expire(DAILY_CAP_KEY, 86400);
  }
  if (newCount > DAILY_CAP_MAX) {
    await redis.decr(DAILY_CAP_KEY);
    return { allowed: false, count: newCount - 1 };
  }
  return { allowed: true, count: newCount };
}

/**
 * Per-wallet daily chat message quota.
 * Limits how many messages a wallet can send to agent chat per day.
 */
const CHAT_QUOTA_PREFIX = 'chat:daily:';
export const CHAT_QUOTA_MAX = 10;
const CHAT_QUOTA_TTL = 24 * 60 * 60; // 24 hours

/**
 * Atomically check AND increment chat quota in a single INCR call.
 */
export async function checkChatQuota(address: string): Promise<{ allowed: boolean; remaining: number }> {
  const key = `${CHAT_QUOTA_PREFIX}${address.toLowerCase()}`;
  const newCount = await redis.incr(key);
  if (newCount === 1) {
    await redis.expire(key, CHAT_QUOTA_TTL);
  }
  if (newCount > CHAT_QUOTA_MAX) {
    await redis.decr(key);
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: Math.max(0, CHAT_QUOTA_MAX - newCount) };
}

