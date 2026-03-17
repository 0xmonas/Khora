import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis/cloudflare';

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
