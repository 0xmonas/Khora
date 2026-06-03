import { describe, it, expect } from 'vitest';
import { isValidGeminiKey, normalizeGeminiKey } from '@/lib/server/byok';

// Synthetic, non-real keys — shape only.
const LEGACY = 'AIzaSyDummyValidLookingKeyForTestPurposesABCDEFG';
const NEWER = 'AQ.AbXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX_YYYYYYYYYY';

describe('isValidGeminiKey', () => {
  it('accepts the legacy AIza key shape', () => {
    expect(isValidGeminiKey(LEGACY)).toBe(true);
  });

  it('accepts the newer AQ. key shape', () => {
    expect(isValidGeminiKey(NEWER)).toBe(true);
  });

  it('rejects junk, short, and empty keys', () => {
    expect(isValidGeminiKey('AIza-too-short')).toBe(false);
    expect(isValidGeminiKey('AQ.short')).toBe(false);
    expect(isValidGeminiKey('not-a-key')).toBe(false);
    expect(isValidGeminiKey('')).toBe(false);
    expect(isValidGeminiKey(null)).toBe(false);
    expect(isValidGeminiKey(undefined)).toBe(false);
  });

  it('rejects a key with a trailing space unless normalized', () => {
    expect(isValidGeminiKey(`${LEGACY} `)).toBe(false);
    expect(normalizeGeminiKey(`  ${NEWER}  `)).toBe(NEWER);
    expect(normalizeGeminiKey('garbage')).toBe(null);
  });
});
