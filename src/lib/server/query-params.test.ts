import { describe, it, expect } from 'vitest';
import { rejectUnknownParams } from './query-params';

const ALLOWED = ['address', 'chain'] as const;

describe('rejectUnknownParams', () => {
  it('allows a request using only known parameters', () => {
    const params = new URLSearchParams('address=0xabc&chain=ethereum');
    expect(rejectUnknownParams(params, ALLOWED)).toBeNull();
  });

  it('allows a request with no parameters at all', () => {
    expect(rejectUnknownParams(new URLSearchParams(''), ALLOWED)).toBeNull();
  });

  it('allows a known parameter to be absent', () => {
    const params = new URLSearchParams('chain=shape');
    expect(rejectUnknownParams(params, ALLOWED)).toBeNull();
  });

  it('rejects a cache-busting parameter appended to a valid request', async () => {
    const params = new URLSearchParams('address=0xabc&chain=ethereum&cb=1');
    const response = rejectUnknownParams(params, ALLOWED);

    expect(response).not.toBeNull();
    expect(response!.status).toBe(400);
    await expect(response!.json()).resolves.toEqual({
      error: 'Unexpected query parameter: cb',
    });
  });

  it('rejects repeated cache-busting values under the same unknown key', () => {
    const params = new URLSearchParams('address=0xabc&v=1&v=2&v=3');
    expect(rejectUnknownParams(params, ALLOWED)?.status).toBe(400);
  });

  it('names the first offending parameter', async () => {
    const params = new URLSearchParams('zzz=1&yyy=2');
    const response = rejectUnknownParams(params, ALLOWED);

    await expect(response!.json()).resolves.toEqual({
      error: 'Unexpected query parameter: zzz',
    });
  });

  it('is case sensitive, so casing variants cannot widen the key', () => {
    const params = new URLSearchParams('Address=0xabc');
    expect(rejectUnknownParams(params, ALLOWED)?.status).toBe(400);
  });

  it('rejects an empty-valued unknown parameter', () => {
    const params = new URLSearchParams('address=0xabc&x=');
    expect(rejectUnknownParams(params, ALLOWED)?.status).toBe(400);
  });
});
