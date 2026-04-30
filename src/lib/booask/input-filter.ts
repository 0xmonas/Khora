import { getRedis } from '@/lib/server/redis';

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions|prompts|rules)/i,
  /repeat\s+(your|the|all)\s+(instructions|prompt|system\s*prompt|rules|configuration)/i,
  /what\s+(are|is)\s+your\s+(instructions|prompt|system\s*prompt|rules|configuration)/i,
  /show\s+(me\s+)?(your|the)\s+(instructions|prompt|system\s*prompt|rules)/i,
  /reveal\s+(your|the)\s+(instructions|prompt|system\s*prompt|rules)/i,
  /act\s+as\s+(DAN|an?\s+unrestricted|an?\s+unfiltered)/i,
  /pretend\s+(you\s+)?(have\s+no|don'?t\s+have|are\s+without)\s+rules/i,
  /jailbreak/i,
  /system\s*:\s*/i,
  /\[INST\]/i,
  /<<SYS>>/i,
  /output\s+(your|the)\s+(entire|full|complete)\s+(prompt|instructions|system)/i,
  /translate\s+(your|the)\s+(prompt|instructions|system\s*prompt)\s+(to|into)/i,
  /encode\s+(your|the)\s+(prompt|instructions)\s+(in|as|to)\s+(base64|hex|binary)/i,
];

const URL_PATTERNS = [
  /https?:\/\/\S+/i,
  /\bwww\.[a-z0-9-]+\.[a-z]{2,}/i,
  /ipfs:\/\/\S+/i,
  /ar:\/\/\S+/i,
  /magnet:\?[^\s]+/i,
  /data:[a-z]+\/[a-z0-9.+-]+;base64,/i,
];

const MARKUP_PATTERNS = [
  /<\s*(script|iframe|img|svg|object|embed|style|link|meta)[\s>]/i,
  /\bjavascript\s*:/i,
  /on(error|load|click|mouseover)\s*=/i,
  /!\[[^\]]*\]\([^)]*\)/,
];

const BASE64_BLOB_PATTERN = /[A-Za-z0-9+/=]{200,}/;

// Built via RegExp constructor so non-printable / wide-unicode ranges survive any source-encoding
// quirks. Equivalent to a literal but expressed entirely with escape sequences.
const CONTROL_CHAR_PATTERN = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]');
const ZERO_WIDTH_PATTERN = new RegExp(
  '[\\u200B-\\u200F\\u2028-\\u202F\\uFEFF\\u00AD]',
  'g',
);
const CYRILLIC_PATTERN = new RegExp('[\\u0400-\\u04FF]', 'g');

const CYRILLIC_HOMOGLYPHS: Record<string, string> = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'r',
  'с': 'c', 'у': 'y', 'х': 'x', 'А': 'A',
  'Е': 'E', 'О': 'O', 'Р': 'R', 'С': 'C',
  'У': 'Y', 'Х': 'X', 'і': 'i', 'І': 'I',
};

function sanitizeForDetection(text: string, replaceWithSpace = false): string {
  return text
    .normalize('NFKC')
    .replace(ZERO_WIDTH_PATTERN, replaceWithSpace ? ' ' : '')
    .replace(/\s{2,}/g, ' ')
    .replace(CYRILLIC_PATTERN, (ch) => CYRILLIC_HOMOGLYPHS[ch] || ch);
}

export type ThreatKind = 'injection' | 'url' | 'markup' | 'blob' | 'control';

export interface ThreatResult {
  kind: ThreatKind | null;
  reason: string | null;
}

export function detectThreat(text: string): ThreatResult {
  if (CONTROL_CHAR_PATTERN.test(text)) {
    return { kind: 'control', reason: 'Control characters detected' };
  }
  const stripped = sanitizeForDetection(text, false);
  const spaced = sanitizeForDetection(text, true);
  if (INJECTION_PATTERNS.some((p) => p.test(stripped) || p.test(spaced))) {
    return { kind: 'injection', reason: 'Prompt injection pattern' };
  }
  if (URL_PATTERNS.some((p) => p.test(stripped))) {
    return { kind: 'url', reason: 'External link or data URI' };
  }
  if (MARKUP_PATTERNS.some((p) => p.test(stripped))) {
    return { kind: 'markup', reason: 'HTML/script/markdown markup' };
  }
  if (BASE64_BLOB_PATTERN.test(stripped)) {
    return { kind: 'blob', reason: 'Long encoded blob' };
  }
  return { kind: null, reason: null };
}

const POLITE_REPLIES: Record<ThreatKind, string> = {
  injection: "BOOASK only answers questions about the BOOA ecosystem. I can't follow instructions that try to override how I work. Try asking about a BOOA, an agent, or a BOOA feature.",
  url: "I don't open external links. Ask me about a BOOA token, an agent, or a BOOA concept and I'll look it up.",
  markup: "Plain text works best. What would you like to know about BOOA?",
  blob: "That looks like a long encoded string. Try asking in plain English. For example: 'BOOA #312' or 'how do I set up Hermes?'",
  control: "Your message contained unusual characters and was blocked. Try plain text.",
};

export function politeReplyFor(kind: ThreatKind): string {
  return POLITE_REPLIES[kind];
}

const ABUSE_PREFIX = 'booask:abuse:';
const ABUSE_MAX = 8;
const ABUSE_TTL = 3600;

export interface AbuseResult {
  blocked: boolean;
  count: number;
  remaining: number;
}

export async function recordAbuse(ip: string): Promise<AbuseResult> {
  const redis = getRedis();
  const key = `${ABUSE_PREFIX}${ip}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, ABUSE_TTL);
  return {
    blocked: count >= ABUSE_MAX,
    count,
    remaining: Math.max(0, ABUSE_MAX - count),
  };
}

export async function isAbuseBlocked(ip: string): Promise<boolean> {
  const redis = getRedis();
  const key = `${ABUSE_PREFIX}${ip}`;
  const count = (await redis.get<number>(key)) ?? 0;
  return count >= ABUSE_MAX;
}

const DAILY_TTL = 86400;
const PER_IP_DAILY_PREFIX = 'booask:daily:ip:';
const GLOBAL_DAILY_KEY = 'booask:daily:global';

function getPerIpDailyMax(): number {
  return Number(process.env.BOOASK_DAILY_PER_IP_MAX ?? 30);
}
function getGlobalDailyMax(): number {
  return Number(process.env.BOOASK_DAILY_GLOBAL_MAX ?? 5000);
}

function dayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface QuotaResult {
  ok: boolean;
  scope?: 'ip' | 'global';
  used?: number;
  limit?: number;
}

export async function checkAndConsumeQuota(ip: string): Promise<QuotaResult> {
  const redis = getRedis();
  const day = dayKey();
  const ipKey = `${PER_IP_DAILY_PREFIX}${ip}:${day}`;
  const globalKey = `${GLOBAL_DAILY_KEY}:${day}`;

  const ipCount = await redis.incr(ipKey);
  if (ipCount === 1) await redis.expire(ipKey, DAILY_TTL);
  if (ipCount > getPerIpDailyMax()) {
    return { ok: false, scope: 'ip', used: ipCount, limit: getPerIpDailyMax() };
  }

  const globalCount = await redis.incr(globalKey);
  if (globalCount === 1) await redis.expire(globalKey, DAILY_TTL);
  if (globalCount > getGlobalDailyMax()) {
    return { ok: false, scope: 'global', used: globalCount, limit: getGlobalDailyMax() };
  }

  return { ok: true, used: ipCount, limit: getPerIpDailyMax() };
}
