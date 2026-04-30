import { NextRequest, NextResponse } from 'next/server';
import { runBooask } from '@/lib/booask/llm';
import { buildTools } from '@/lib/booask/tools';
import {
  detectThreat,
  politeReplyFor,
  recordAbuse,
  isAbuseBlocked,
  checkAndConsumeQuota,
} from '@/lib/booask/input-filter';
import { recordBooaskRequest } from '@/lib/booask/metrics';
import type { ErrorKind } from '@/lib/booask/metrics';
import { getIP } from '@/lib/ratelimit';
import type { BooaskMessage } from '@/lib/booask/types';

export const maxDuration = 30;

const MAX_MESSAGE_LENGTH = 800;
const MAX_HISTORY = 12;

const COOLDOWN_REPLY =
  "Looks like there have been a lot of blocked messages from your end. BOOASK is taking a short break for you. Try again in an hour with a plain question about BOOA, agents, or the studio.";

export async function POST(request: NextRequest) {
  const ip = getIP(request);

  if (await isAbuseBlocked(ip)) {
    return NextResponse.json(
      { reply: COOLDOWN_REPLY, blocked: true },
      { status: 429 },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json(
      { error: `Message too long (max ${MAX_MESSAGE_LENGTH} characters)` },
      { status: 400 },
    );
  }

  // Pre-LLM threat detection on the new user message
  const threat = detectThreat(message);
  if (threat.kind) {
    const abuse = await recordAbuse(ip);
    void recordBooaskRequest({
      ip,
      inputTokens: 0,
      outputTokens: 0,
      toolCallCount: 0,
      usingOwnKey: false,
      errorKind: abuse.blocked ? 'abuse_blocked' : 'threat_blocked',
    });
    return NextResponse.json(
      {
        reply: abuse.blocked ? COOLDOWN_REPLY : politeReplyFor(threat.kind),
        blocked: abuse.blocked,
      },
      { status: abuse.blocked ? 429 : 200 },
    );
  }

  // Sanitize history: drop any entry that fails the threat filter or looks malformed
  const historyRaw = Array.isArray(body.history) ? body.history : [];
  const history: BooaskMessage[] = [];
  for (const entry of historyRaw.slice(-MAX_HISTORY)) {
    if (
      entry &&
      typeof entry === 'object' &&
      (entry as { role?: unknown }).role &&
      typeof (entry as { text?: unknown }).text === 'string'
    ) {
      const role = (entry as { role: unknown }).role;
      const text = (entry as { text: string }).text;
      if (role !== 'user' && role !== 'model') continue;
      if (text.length > MAX_MESSAGE_LENGTH) continue;
      if (detectThreat(text).kind) continue;
      history.push({ role, text });
    }
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: 'BOOASK is not configured (missing API key on server)' },
      { status: 503 },
    );
  }

  const userApiKeyRaw = request.headers.get('x-gemini-key')?.trim() || '';
  // Reject obvious junk keys to prevent daily-cap bypass via arbitrary headers.
  // Real Gemini keys: 'AIza' prefix + 35+ url-safe chars. Treat anything else as no key.
  const userApiKey =
    userApiKeyRaw && /^AIza[A-Za-z0-9_-]{35,}$/.test(userApiKeyRaw) ? userApiKeyRaw : undefined;
  let usingOwnKey = false;

  if (!userApiKey) {
    const quota = await checkAndConsumeQuota(ip);
    if (!quota.ok) {
      const reply = quota.scope === 'global'
        ? "BOOASK has hit today's global limit. Add your own Gemini API key to continue, or try again tomorrow."
        : `You've reached today's BOOASK limit (${quota.limit} questions/day per IP). Add your own Gemini API key to continue, or try again in 24h.`;
      void recordBooaskRequest({
        ip,
        inputTokens: 0,
        outputTokens: 0,
        toolCallCount: 0,
        usingOwnKey: false,
        errorKind: quota.scope === 'global' ? 'quota_global' : 'quota_ip',
      });
      return NextResponse.json(
        { reply, blocked: true, quotaExceeded: true, quotaScope: quota.scope },
        { status: 429 },
      );
    }
  } else {
    usingOwnKey = true;
  }

  const { defs, executors } = buildTools(request);

  try {
    const result = await runBooask({ message, history, toolDefs: defs, executors, userApiKey });
    void recordBooaskRequest({
      ip,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      toolCallCount: result.toolCalls.length,
      usingOwnKey,
    });
    return NextResponse.json({
      reply: result.reply,
      toolCalls: result.toolCalls,
      usingOwnKey,
    });
  } catch (e) {
    if (process.env.BOOASK_DEBUG === '1') {
      console.error('[booask] runBooask failed:', e instanceof Error ? `${e.message}\n${e.stack}` : e);
    } else {
      console.error('[booask] runBooask failed:', e instanceof Error ? e.message : 'unknown');
    }
    const msg = e instanceof Error ? e.message.toLowerCase() : '';
    let errorKind: ErrorKind = 'unknown';
    if (msg.includes('quota') || msg.includes('resource_exhausted') || msg.includes('429')) {
      errorKind = 'gemini_quota';
    } else if (msg.includes('api key not valid') || msg.includes('api_key_invalid')) {
      errorKind = 'gemini_invalid_key';
    }
    void recordBooaskRequest({
      ip,
      inputTokens: 0,
      outputTokens: 0,
      toolCallCount: 0,
      usingOwnKey,
      errorKind,
    });
    if (errorKind === 'gemini_quota') {
      return NextResponse.json(
        { error: 'BOOASK is at capacity, try again in a moment.' },
        { status: 429 },
      );
    }
    if (errorKind === 'gemini_invalid_key') {
      return NextResponse.json({ error: 'BOOASK API key invalid' }, { status: 503 });
    }
    return NextResponse.json(
      { error: 'BOOASK failed to answer. Try again.' },
      { status: 500 },
    );
  }
}
