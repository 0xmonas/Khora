import { NextRequest, NextResponse } from 'next/server';
import { checkAdminAuth } from '@/lib/server/admin-auth';
import {
  publishNextDay,
  PublishError,
  type PublishNextDayInput,
} from '@/lib/writers-room/storage';
import {
  CAPTION_MAX,
  DESCRIPTION_MAX,
  TOKEN_ID_MAX,
} from '@/lib/writers-room/types';

export const maxDuration = 15;

function parseOverride(raw: unknown): PublishNextDayInput {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: PublishNextDayInput = {};
  if (typeof r.caption === 'string') {
    out.caption = r.caption.trim().slice(0, CAPTION_MAX);
  }
  if (typeof r.description === 'string') {
    out.description = r.description.trim().slice(0, DESCRIPTION_MAX);
  }
  if (r.tokenId === null) {
    out.tokenId = null;
  } else if (typeof r.tokenId === 'number' && Number.isInteger(r.tokenId)) {
    if (r.tokenId >= 0 && r.tokenId <= TOKEN_ID_MAX) {
      out.tokenId = r.tokenId;
    }
  }
  if (r.imageUrl === null) {
    out.imageUrl = null;
  } else if (typeof r.imageUrl === 'string') {
    const trimmed = r.imageUrl.trim();
    if (trimmed.length > 0 && trimmed.length <= 2048) out.imageUrl = trimmed;
  }
  return out;
}

/**
 * POST /api/writers-room/admin/publish
 * Header: Authorization: Bearer <WRITERS_ROOM_ADMIN_SECRET>
 * Body (optional): { caption?, description?, tokenId?, imageUrl? }
 *
 * Closes the current day's voting, picks the winning submission for Day N+1,
 * and publishes it. The op can override caption/description/tokenId/imageUrl
 * on top of the winning submission.
 */
export async function POST(request: NextRequest) {
  if (!checkAdminAuth(request, 'WRITERS_ROOM_ADMIN_SECRET')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown = {};
  try {
    if (request.headers.get('content-length')) {
      body = await request.json();
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const override = parseOverride(body);

  try {
    const result = await publishNextDay(override);
    return NextResponse.json({
      ok: true,
      day: result.day,
      pickedSubmission: result.pickedSubmission,
      candidateCount: result.candidateCount,
    });
  } catch (e) {
    if (e instanceof PublishError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    return NextResponse.json({ error: 'Publish failed.' }, { status: 500 });
  }
}
