import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ──

const mockSession: Record<string, unknown> = {};

vi.mock('iron-session', () => ({
  getIronSession: vi.fn(async () => mockSession),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({})),
}));

// ── Tests ──

describe('getAuthSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockSession).forEach((key) => delete mockSession[key]);
  });

  it('should return null when no address in session', async () => {
    const { getAuthSession } = await import('@/lib/auth');

    const result = await getAuthSession();
    expect(result).toBeNull();
  });

  it('should return null when session has nonce but no address', async () => {
    mockSession.nonce = 'some-nonce';

    const { getAuthSession } = await import('@/lib/auth');

    const result = await getAuthSession();
    expect(result).toBeNull();
  });

  it('should return session data when authenticated', async () => {
    mockSession.address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';
    mockSession.chainId = 84532;

    const { getAuthSession } = await import('@/lib/auth');

    const result = await getAuthSession();
    expect(result).toEqual({
      address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      chainId: 84532,
    });
  });

  it('should return address even if chainId is missing', async () => {
    mockSession.address = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

    const { getAuthSession } = await import('@/lib/auth');

    const result = await getAuthSession();
    expect(result).toEqual({
      address: '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045',
      chainId: undefined,
    });
  });
});
