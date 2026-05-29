import { NextRequest, NextResponse } from 'next/server';
import { isHolder } from '@/lib/server/holders';
import { validateSubmissionInput, isValidAddress } from '@/lib/writers-room/validation';
import {
  editSubmission,
  deleteSubmission,
  SubmissionMutationError,
} from '@/lib/writers-room/storage';

export const maxDuration = 15;

const SUBMISSION_ID_RE = /^[a-f0-9]{32}$/;

async function requireHolder(request: NextRequest): Promise<string | NextResponse> {
  const walletAddress = request.headers.get('x-siwe-address');
  if (!walletAddress || !isValidAddress(walletAddress)) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }
  if (!(await isHolder(walletAddress))) {
    return NextResponse.json({ error: 'Holder only.' }, { status: 403 });
  }
  return walletAddress;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!SUBMISSION_ID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid submission id.' }, { status: 400 });
  }

  const auth = await requireHolder(request);
  if (auth instanceof NextResponse) return auth;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  let input;
  try {
    input = validateSubmissionInput(body);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Invalid input.' },
      { status: 400 },
    );
  }

  try {
    const submission = await editSubmission(id, auth, input);
    return NextResponse.json({ ok: true, submission });
  } catch (e) {
    if (e instanceof SubmissionMutationError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Edit failed.' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!SUBMISSION_ID_RE.test(id)) {
    return NextResponse.json({ error: 'Invalid submission id.' }, { status: 400 });
  }

  const auth = await requireHolder(request);
  if (auth instanceof NextResponse) return auth;

  try {
    await deleteSubmission(id, auth);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof SubmissionMutationError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Delete failed.' }, { status: 500 });
  }
}
