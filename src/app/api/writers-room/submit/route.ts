import { NextRequest, NextResponse } from 'next/server';
import { isHolder } from '@/lib/server/holders';
import { validateSubmissionInput } from '@/lib/writers-room/validation';
import { getState, submitForDay, SubmitError } from '@/lib/writers-room/storage';
import { isValidAddress } from '@/lib/writers-room/validation';

export const maxDuration = 15;

export async function POST(request: NextRequest) {
  const walletAddress = request.headers.get('x-siwe-address');
  if (!walletAddress || !isValidAddress(walletAddress)) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  if (!(await isHolder(walletAddress))) {
    return NextResponse.json({ error: 'Holder only.' }, { status: 403 });
  }

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

  const state = await getState();
  if (!state.submissionsOpenForDay) {
    return NextResponse.json(
      { error: 'Submissions are not open right now.' },
      { status: 409 },
    );
  }

  try {
    const result = await submitForDay(
      state.submissionsOpenForDay,
      walletAddress,
      input,
    );
    return NextResponse.json({
      ok: true,
      submission: result.submission,
    });
  } catch (e) {
    if (e instanceof SubmitError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: 'Submission failed.' },
      { status: 500 },
    );
  }
}
