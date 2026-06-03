// Shared BYOK key validation. Rejects junk so arbitrary headers can't bypass
// the daily quota, and garbage never reaches the provider SDK.
//
// Google issues two Gemini/API key shapes:
//   - Legacy: "AIza" + 35+ url-safe chars
//   - Newer:  "AQ." + 30+ url-safe chars
// Accept both. Keep this the single source of truth for every BYOK route.
const GEMINI_KEY_RE = /^(?:AIza[A-Za-z0-9_-]{35,}|AQ\.[A-Za-z0-9_-]{30,})$/;

export function isValidGeminiKey(key: string | null | undefined): boolean {
  return !!key && GEMINI_KEY_RE.test(key);
}

// Returns the trimmed key if it's well-formed, otherwise null.
export function normalizeGeminiKey(raw: string | null | undefined): string | null {
  const key = raw?.trim() || '';
  return isValidGeminiKey(key) ? key : null;
}
