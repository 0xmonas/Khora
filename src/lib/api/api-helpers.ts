import { NextRequest, NextResponse } from 'next/server';
import { ZodSchema, ZodError } from 'zod';
import { ApiErrorResponse } from '@/lib/types';

const MAX_JSON_BODY_BYTES = 64 * 1024;

class BodyTooLargeError extends Error {}

async function readJsonBody(request: NextRequest): Promise<unknown> {
  if (Number(request.headers.get('content-length')) > MAX_JSON_BODY_BYTES) {
    throw new BodyTooLargeError();
  }
  const reader = request.body?.getReader();
  if (!reader) return JSON.parse('');

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_JSON_BODY_BYTES) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function validateInput<T>(
  request: NextRequest,
  schema: ZodSchema<T>
): Promise<{ data: T } | { error: NextResponse<ApiErrorResponse> }> {
  try {
    const body = await readJsonBody(request);
    const validatedData = schema.parse(body);
    return { data: validatedData };
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return { error: NextResponse.json({ error: 'Request body too large' }, { status: 413 }) };
    }
    if (error instanceof ZodError) {
      const firstError = error.issues[0];
      return {
        error: NextResponse.json(
          {
            error: firstError.message,
            field: firstError.path.join('.'),
          },
          { status: 400 }
        ),
      };
    }
    return {
      error: NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      ),
    };
  }
}
