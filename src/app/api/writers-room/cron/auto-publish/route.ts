import { NextRequest, NextResponse } from 'next/server';
import {
  getState,
  publishNextDay,
  PublishError,
} from '@/lib/writers-room/storage';
import { WRITERS_ROOM_TOTAL_DAYS } from '@/lib/writers-room/types';

export const maxDuration = 30;

/**
 * GET /api/writers-room/cron/auto-publish
 *
 * Vercel cron runs this hourly. The job:
 *   1. Skip if the cycle has reached Day 30.
 *   2. Skip if the current voting window is still open.
 *   3. Otherwise pick the winning page and publish the next day.
 *
 * The first call after a deploy lazy-inits the cycle clock via getState(),
 * so no manual seed is required. Day 0 is a static UI block, not a record.
 *
 * Auth: Vercel auto-injects `Authorization: Bearer $CRON_SECRET` on cron
 * invocations. We reject anything that doesn't match. CRON_SECRET must be
 * set in production env vars.
 */
export async function GET(request: NextRequest) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured.' },
      { status: 500 },
    );
  }
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const state = await getState();

  if (state.currentDay >= WRITERS_ROOM_TOTAL_DAYS) {
    return NextResponse.json({
      skipped: true,
      reason: 'Cycle complete.',
    });
  }

  if (state.votingOpen) {
    return NextResponse.json({
      skipped: true,
      reason: 'Voting still open.',
      currentDay: state.currentDay,
      votingClosesAt: state.votingClosesAt,
    });
  }

  try {
    const result = await publishNextDay();
    return NextResponse.json({
      ok: true,
      publishedDay: result.day.dayNumber,
      candidateCount: result.candidateCount,
      pickedSubmissionId: result.pickedSubmission?.id ?? null,
      pickedFromAddress: result.pickedSubmission?.submitterAddress ?? null,
    });
  } catch (e) {
    if (e instanceof PublishError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json(
      { error: 'Auto-publish failed.' },
      { status: 500 },
    );
  }
}
