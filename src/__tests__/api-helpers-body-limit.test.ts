import { describe, it, expect, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { validateInput } from '@/lib/api/api-helpers';
import { enrichAgentSchema } from '@/lib/validation/schemas';

const LIMIT = 64 * 1024;
const url = 'https://booa.app/api/enrich-agent';
const post = (body: string, headers: Record<string, string> = {}) =>
  new NextRequest(url, { method: 'POST', body, headers });
const streamed = (chunks: string[], onPull?: () => void, headers: Record<string, string> = {}) => {
  const enc = new TextEncoder();
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      onPull?.();
      if (i < chunks.length) c.enqueue(enc.encode(chunks[i++]));
      else c.close();
    },
  });
  return new NextRequest(url, { method: 'POST', body: stream, headers, duplex: 'half' } as ConstructorParameters<typeof NextRequest>[1]);
};
const schema = z.object({ a: z.string() });

describe('validateInput body limit', () => {
  it('accepts a normal body', async () => {
    const r = await validateInput(post('{"a":"x"}'), schema);
    expect('data' in r && r.data).toEqual({ a: 'x' });
  });

  it('accepts the largest valid enrich body', async () => {
    const big = '界'.repeat(100);
    const body = JSON.stringify({ name: big, description: '界'.repeat(1000), skills: Array(20).fill(big), domains: Array(20).fill(big) });
    expect(Buffer.byteLength(body)).toBeLessThan(LIMIT);
    const r = await validateInput(post(body), enrichAgentSchema);
    expect('data' in r).toBe(true);
  });

  it('accepts a body of exactly the limit', async () => {
    const pad = 'x'.repeat(LIMIT - '{"a":""}'.length);
    const r = await validateInput(post(`{"a":"${pad}"}`), schema);
    expect('data' in r).toBe(true);
  });

  it('rejects one byte over the limit before parsing', async () => {
    const parse = vi.spyOn(schema, 'parse');
    const pad = 'x'.repeat(LIMIT - '{"a":""}'.length + 1);
    const r = await validateInput(post(`{"a":"${pad}"}`), schema);
    expect('error' in r && r.error.status).toBe(413);
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });

  it('rejects by declared content-length', async () => {
    const r = await validateInput(post('{"a":"x"}', { 'content-length': String(LIMIT + 1) }), schema);
    expect('error' in r && r.error.status).toBe(413);
  });

  it('stops reading a chunked body with no or understated length', async () => {
    let pulls = 0;
    const chunk = 'x'.repeat(32 * 1024);
    const r = await validateInput(streamed(Array(1000).fill(chunk), () => { pulls++; }, { 'content-length': '10' }), schema);
    expect('error' in r && r.error.status).toBe(413);
    expect(pulls).toBeLessThan(10);
  });

  it('never parses the oversized array that used to exhaust memory', async () => {
    const parse = vi.spyOn(enrichAgentSchema, 'parse');
    const body = JSON.stringify({ name: 'a', description: 'b', skills: new Array(2_000_000).fill(1) });
    const r = await validateInput(post(body), enrichAgentSchema);
    expect('error' in r && r.error.status).toBe(413);
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });

  it('keeps malformed and empty JSON as 400', async () => {
    const a = await validateInput(post('{not json'), schema);
    expect('error' in a && a.error.status).toBe(400);
    const b = await validateInput(new NextRequest(url, { method: 'POST' }), schema);
    expect('error' in b && b.error.status).toBe(400);
  });

  it('keeps schema failures as 400 with the field', async () => {
    const r = await validateInput(post('{"a":1}'), schema);
    expect('error' in r && r.error.status).toBe(400);
  });
});
