import { describe, it, expect } from 'vitest';
import { sessionOptions, type SessionData } from '@/lib/session';

describe('Session Config', () => {
  it('should use khora_siwe as cookie name', () => {
    expect(sessionOptions.cookieName).toBe('khora_siwe');
  });

  it('should set httpOnly to true', () => {
    expect(sessionOptions.cookieOptions?.httpOnly).toBe(true);
  });

  it('should set sameSite to lax', () => {
    expect(sessionOptions.cookieOptions?.sameSite).toBe('lax');
  });

  it('should set maxAge to 7 days', () => {
    const sevenDays = 60 * 60 * 24 * 7;
    expect(sessionOptions.cookieOptions?.maxAge).toBe(sevenDays);
  });

  it('should set path to /', () => {
    expect(sessionOptions.cookieOptions?.path).toBe('/');
  });

  it('should set secure based on NODE_ENV', () => {
    // In test env, NODE_ENV is 'test', not 'production'
    expect(sessionOptions.cookieOptions?.secure).toBe(false);
  });

  it('should have correct SessionData shape', () => {
    const session: SessionData = {
      nonce: 'abc',
      address: '0x123',
      chainId: 84532,
    };

    expect(session.nonce).toBe('abc');
    expect(session.address).toBe('0x123');
    expect(session.chainId).toBe(84532);
  });

  it('should allow optional fields in SessionData', () => {
    const session: SessionData = {};

    expect(session.nonce).toBeUndefined();
    expect(session.address).toBeUndefined();
    expect(session.chainId).toBeUndefined();
  });
});
