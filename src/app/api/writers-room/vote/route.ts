import { NextRequest, NextResponse } from 'next/server';
import { isHolder } from '@/lib/server/holders';
import {
  likeSubmission,
  unlikeSubmission,
  VoteError,
} from '@/lib/writers-room/storage';
import { isValidAddress } from '@/lib/writers-room/validation';

export const maxDuration = 15;

const SUBMISSION_ID_RE = /^[a-f0-9]{32}$/;

async function readBody(
  request: NextRequest,
): Promise<{ submissionId: string | null; handle: string }> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const rawId = body?.submissionId;
    const submissionId =
      typeof rawId === 'string' && SUBMISSION_ID_RE.test(rawId) ? rawId : null;
    const handle = typeof body?.handle === 'string' ? body.handle : '';
    return { submissionId, handle };
  } catch {
    return { submissionId: null, handle: '' };
  }
}

export async function POST(request: NextRequest) {
  const walletAddress = request.headers.get('x-siwe-address');
  if (!walletAddress || !isValidAddress(walletAddress)) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }
  if (!(await isHolder(walletAddress))) {
    return NextResponse.json({ error: 'Holder only.' }, { status: 403 });
  }

  const { submissionId, handle } = await readBody(request);
  if (!submissionId) {
    return NextResponse.json(
      { error: 'submissionId is required.' },
      { status: 400 },
    );
  }

  try {
    const result = await likeSubmission(submissionId, walletAddress, handle);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof VoteError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Vote failed.' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const walletAddress = request.headers.get('x-siwe-address');
  if (!walletAddress || !isValidAddress(walletAddress)) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }
  if (!(await isHolder(walletAddress))) {
    return NextResponse.json({ error: 'Holder only.' }, { status: 403 });
  }

  const { submissionId } = await readBody(request);
  if (!submissionId) {
    return NextResponse.json(
      { error: 'submissionId is required.' },
      { status: 400 },
    );
  }

  try {
    const result = await unlikeSubmission(submissionId, walletAddress);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof VoteError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Unvote failed.' }, { status: 500 });
  }
}
