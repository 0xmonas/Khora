// Privacy-safe daily aggregate metrics for BOOASK.
//
// What we collect (aggregate only, no PII):
// • request count
// • approximate unique-IP count (HyperLogLog — does not store IPs)
// • input/output token sums (for cost calc)
// • tool-call count
// • BYOK request count (excluded from our cost)
// • error counts grouped by kind
//
// What we never collect:
// • message content
// • token IDs queried
// • wallet addresses (BOOASK has no auth)
// • exact IP (only HLL approximation for cardinality)
// • user-agent / geo / referrer
//
// All keys are day-prefixed and auto-expire after 90 days.

import { getRedis } from '@/lib/server/redis';

const METRICS_PREFIX = 'booask:metrics';
const METRICS_TTL = 90 * 86400; // 90 days

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function k(day: string, suffix: string): string {
  return `${METRICS_PREFIX}:${day}:${suffix}`;
}

export type ErrorKind =
  | 'threat_blocked'
  | 'abuse_blocked'
  | 'invalid_input'
  | 'quota_ip'
  | 'quota_global'
  | 'gemini_quota'
  | 'gemini_invalid_key'
  | 'unknown';

export interface RequestMetrics {
  inputTokens: number;
  outputTokens: number;
  toolCallCount: number;
  usingOwnKey: boolean;
  errorKind?: ErrorKind;
  ip: string;
}

/**
 * Record a single BOOASK request. Best-effort: any Redis failure is swallowed
 * so metrics tracking never blocks the user's actual request.
 */
export async function recordBooaskRequest(m: RequestMetrics): Promise<void> {
  try {
    const redis = getRedis();
    const day = dayKey();

    // Total request counter (always)
    const reqCount = await redis.incr(k(day, 'requests'));
    if (reqCount === 1) await redis.expire(k(day, 'requests'), METRICS_TTL);

    // Approximate unique IPs via HyperLogLog (does NOT store the IP)
    await redis.pfadd(k(day, 'ips'), m.ip);
    // Set TTL once on first add (idempotent)
    await redis.expire(k(day, 'ips'), METRICS_TTL);

    if (m.usingOwnKey) {
      const byok = await redis.incr(k(day, 'byok'));
      if (byok === 1) await redis.expire(k(day, 'byok'), METRICS_TTL);
    } else {
      // Token usage only counts toward our cost when not BYOK
      if (m.inputTokens > 0) {
        await redis.incrby(k(day, 'tokens:input'), m.inputTokens);
        await redis.expire(k(day, 'tokens:input'), METRICS_TTL);
      }
      if (m.outputTokens > 0) {
        await redis.incrby(k(day, 'tokens:output'), m.outputTokens);
        await redis.expire(k(day, 'tokens:output'), METRICS_TTL);
      }
    }

    if (m.toolCallCount > 0) {
      await redis.incrby(k(day, 'tool_calls'), m.toolCallCount);
      await redis.expire(k(day, 'tool_calls'), METRICS_TTL);
    }

    if (m.errorKind) {
      const eKey = k(day, `errors:${m.errorKind}`);
      const eCount = await redis.incr(eKey);
      if (eCount === 1) await redis.expire(eKey, METRICS_TTL);
    }
  } catch {
    // Metrics are best-effort. Do not surface failures to caller.
  }
}

// Gemini 2.5 Flash Lite pricing (USD per 1M tokens). Update if Google changes.
const PRICE_INPUT_PER_M_USD = 0.10;
const PRICE_OUTPUT_PER_M_USD = 0.40;

export function computeGeminiCostUSD(inputTokens: number, outputTokens: number): number {
  return (
    (inputTokens / 1_000_000) * PRICE_INPUT_PER_M_USD +
    (outputTokens / 1_000_000) * PRICE_OUTPUT_PER_M_USD
  );
}

export interface DailyReport {
  day: string;
  requests: number;
  uniqueIPs: number;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  byokRequests: number;
  costUSD: number;
  errors: Record<string, number>;
}

/**
 * Read aggregated metrics for a given day. Returns zeros if day has no data.
 * day format: YYYY-MM-DD. Defaults to today UTC.
 */
export async function getBooaskDailyReport(day?: string): Promise<DailyReport> {
  const redis = getRedis();
  const d = day ?? dayKey();

  const [requests, inputTokens, outputTokens, toolCalls, byok, ipCardinality] = await Promise.all([
    redis.get<number>(k(d, 'requests')),
    redis.get<number>(k(d, 'tokens:input')),
    redis.get<number>(k(d, 'tokens:output')),
    redis.get<number>(k(d, 'tool_calls')),
    redis.get<number>(k(d, 'byok')),
    redis.pfcount(k(d, 'ips')),
  ]);

  // Discover error kinds via SCAN (small N, only this day's prefix)
  const errors: Record<string, number> = {};
  let cursor = 0;
  do {
    const res = await redis.scan(cursor, {
      match: k(d, 'errors:*'),
      count: 100,
    });
    cursor = Number(res[0]);
    const keys = res[1] as string[];
    for (const errKey of keys) {
      const kind = errKey.split(':errors:')[1];
      const v = (await redis.get<number>(errKey)) ?? 0;
      errors[kind] = v;
    }
  } while (cursor !== 0);

  const inT = inputTokens ?? 0;
  const outT = outputTokens ?? 0;

  return {
    day: d,
    requests: requests ?? 0,
    uniqueIPs: ipCardinality ?? 0,
    inputTokens: inT,
    outputTokens: outT,
    toolCalls: toolCalls ?? 0,
    byokRequests: byok ?? 0,
    costUSD: computeGeminiCostUSD(inT, outT),
    errors,
  };
}
