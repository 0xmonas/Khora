import { describe, it, expect } from 'vitest';

describe('POST /api/mint-request', () => {
  it('is gone now that minting has ended', async () => {
    const { POST } = await import('@/app/api/mint-request/route');
    const res = POST();
    expect(res.status).toBe(410);
  });
});
