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
  timeout: 1000,
});

/**
 * Rate limiter for write operations (POST/DELETE): 30 per 60s per IP.
 */
export const writeLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(30, '60 s'),
  prefix: 'rl:write',
  timeout: 1000,
});

/**
 * Image optimization limiter: 240 per 60s per IP.
 * Deliberately far looser than the API limiters — a single gallery page load
 * legitimately requests dozens of images — but still bounded, because every
 * distinct (url, w, q) triple is a separately billed transformation.
 */
export const imageLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(240, '60 s'),
  prefix: 'rl:image',
  timeout: 1000,
});

const MEMORY_WINDOW_MS = 60_000;
const memoryHits = new Map<string, number[]>();

/**
 * Degraded-mode limiter used only when Redis is unreachable.
 *
 * Per-isolate and therefore approximate: N isolates allow up to N*max. That is
 * accepted on purpose. The alternative is what this replaces — a failed Redis
 * call silently removing rate limiting altogether, which turns an outage of the
 * limiter into unbounded spend on every metered upstream behind it.
 */
export function memoryLimit(key: string, max: number): { success: boolean } {
  const now = Date.now();
  const cutoff = now - MEMORY_WINDOW_MS;

  const hits = (memoryHits.get(key) || []).filter((t) => t > cutoff);
  hits.push(now);
  memoryHits.set(key, hits);

  // Bound memory: drop keys that fell out of the window entirely.
  if (memoryHits.size > 10_000) {
    for (const [k, times] of memoryHits) {
      if (!times.some((t) => t > cutoff)) memoryHits.delete(k);
    }
  }

  return { success: hits.length <= max };
}

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
