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

const LORE_QUOTA_PREFIX = 'lore:daily:';
export const LORE_QUOTA_MAX = 1;
const LORE_QUOTA_TTL = 24 * 60 * 60;

export async function checkLoreQuota(
  chainId: number,
  tokenId: number,
): Promise<{ allowed: boolean; remaining: number }> {
  const key = `${LORE_QUOTA_PREFIX}${chainId}:${tokenId}`;
  const newCount = await redis.incr(key);
  if (newCount === 1) {
    await redis.expire(key, LORE_QUOTA_TTL);
  }
  if (newCount > LORE_QUOTA_MAX) {
    await redis.decr(key);
    return { allowed: false, remaining: 0 };
  }
  return { allowed: true, remaining: Math.max(0, LORE_QUOTA_MAX - newCount) };
}

