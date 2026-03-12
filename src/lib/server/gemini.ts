import { GoogleGenAI } from '@google/genai';

/**
 * Singleton Gemini AI client — production-ready for both local and Vercel.
 *
 * Credential resolution order:
 * 1. GOOGLE_SERVICE_ACCOUNT_KEY (base64 JSON) — works on Vercel / any serverless
 * 2. GOOGLE_APPLICATION_CREDENTIALS (file path) — works on local / VM
 * 3. GEMINI_API_KEY — AI Studio fallback (lower rate limits)
 */
let _ai: InstanceType<typeof GoogleGenAI> | null = null;

function parseServiceAccountKey(): Record<string, unknown> | null {
  const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!b64) return null;
  try {
    return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  } catch {
    console.error('Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY — invalid base64 JSON');
    return null;
  }
}

export function getAI(): InstanceType<typeof GoogleGenAI> {
  if (_ai) return _ai;

  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'global';

  // Priority 1: Inline credentials (base64 — Vercel / serverless)
  const inlineCredentials = parseServiceAccountKey();
  if (project && inlineCredentials) {
    _ai = new GoogleGenAI({
      vertexai: true,
      project,
      location,
      googleAuthOptions: { credentials: inlineCredentials },
    });
    return _ai;
  }

  // Priority 2: File-based credentials (GOOGLE_APPLICATION_CREDENTIALS — local dev)
  if (project && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    _ai = new GoogleGenAI({
      vertexai: true,
      project,
      location,
    });
    return _ai;
  }

  // Priority 3: AI Studio API key (lower rate limits)
  if (process.env.GEMINI_API_KEY) {
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    return _ai;
  }

  throw new Error(
    'Gemini credentials not configured. Set one of: ' +
    'GOOGLE_SERVICE_ACCOUNT_KEY (base64), ' +
    'GOOGLE_APPLICATION_CREDENTIALS (file path), ' +
    'or GEMINI_API_KEY'
  );
}
