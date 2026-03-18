import { Redis } from '@upstash/redis';

/**
 * Shared Redis client singleton with validated env vars.
 * Fails fast with a clear error instead of `undefined` at runtime.
 */
let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (_redis) return _redis;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error(
      'Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN environment variables'
    );
  }

  _redis = new Redis({ url, token });
  return _redis;
}
