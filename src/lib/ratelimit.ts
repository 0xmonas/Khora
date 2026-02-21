import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

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
 * Helper to extract IP from Next.js request.
 */
export function getIP(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') ?? '127.0.0.1';
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
export const GEN_QUOTA_MAX = 5;
const GEN_QUOTA_TTL = 24 * 60 * 60; // 1 day (no commit deadline in V2, shorter TTL)

export async function checkGenerationQuota(address: string): Promise<{ allowed: boolean; remaining: number }> {
  const key = `${GEN_QUOTA_PREFIX}${address.toLowerCase()}`;
  const count = (await redis.get<number>(key)) ?? 0;
  return { allowed: count < GEN_QUOTA_MAX, remaining: Math.max(0, GEN_QUOTA_MAX - count) };
}

export async function incrementGenerationCount(address: string): Promise<void> {
  const key = `${GEN_QUOTA_PREFIX}${address.toLowerCase()}`;
  const newCount = await redis.incr(key);
  if (newCount === 1) {
    await redis.expire(key, GEN_QUOTA_TTL);
  }
}

export async function resetGenerationQuota(address: string): Promise<void> {
  const key = `${GEN_QUOTA_PREFIX}${address.toLowerCase()}`;
  await redis.del(key);
}
