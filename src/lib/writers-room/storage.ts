// Redis storage layer for Writers Room.
// All state mutations route through this module so atomicity, rate-limiting,
// and key namespacing live in one place.

import { getRedis } from '@/lib/server/redis';
import { WR } from './keys';
import {
  WRITERS_ROOM_TOTAL_DAYS,
  WRITERS_ROOM_VOTING_WINDOW_MS,
  type DayEntry,
  type DayState,
  type LeaderboardResponse,
  type LeaderboardRow,
  type Submission,
  type WritersRoomState,
} from './types';
import type { ValidatedSubmission, DaySeedInput } from './validation';
import { normalizeXHandle, isValidXHandle } from './validation';
import { DAY_ZERO_CAPTION, DAY_ZERO_DESCRIPTION } from './origin';

const SUBMISSION_ID_BYTES = 16;

export class HandleError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface HandleBinding {
  canonical: string;
  reused: boolean;
}

// Bind an address to one canonical (lowercase) X handle. A wallet keeps a
// single identity: a second, different handle is rejected. The reverse index
// (handle -> addresses) lets the op spot one handle voting from many wallets.
async function bindHandle(address: string, rawHandle: string): Promise<HandleBinding> {
  const addr = address.toLowerCase();
  const normalized = normalizeXHandle(rawHandle);
  if (!isValidXHandle(normalized)) {
    throw new HandleError(400, 'A valid X handle is required.');
  }
  const canonical = normalized.toLowerCase();

  const redis = getRedis();
  const existing = await redis.get<string>(WR.addrHandle(addr));
  if (existing && existing !== canonical) {
    throw new HandleError(
      409,
      `This wallet is linked to @${existing}. Use that handle.`,
    );
  }
  if (!existing) await redis.set(WR.addrHandle(addr), canonical);
  await redis.sadd(WR.handleAddrs(canonical), addr);
  const owners = await redis.scard(WR.handleAddrs(canonical));
  return { canonical, reused: owners > 1 };
}

function generateSubmissionId(): string {
  // crypto.randomUUID without dashes — 32 hex chars. Falls back to Math.random
  // shouldn't happen in Node 18+ (server) but kept defensive.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID().replace(/-/g, '');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c = (globalThis as any).crypto;
  if (c && typeof c.getRandomValues === 'function') {
    const buf = new Uint8Array(SUBMISSION_ID_BYTES);
    c.getRandomValues(buf);
    return Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  throw new Error('No secure RNG available for submission id.');
}

export async function getCurrentDayNumber(): Promise<number> {
  const redis = getRedis();
  const v = await redis.get<number>(WR.currentDay);
  return typeof v === 'number' && v >= 0 ? v : 0;
}

// Returns the timestamp (ms) when the 30-day community cycle was kicked off,
// initializing it atomically on the first call after a deploy/reset. SET NX
// guards against double-init under concurrent requests.
export async function getOrInitCycleStartedAt(): Promise<number> {
  const redis = getRedis();
  const existing = await redis.get<number>(WR.cycleStartedAt);
  if (typeof existing === 'number') return existing;
  const now = Date.now();
  await redis.set(WR.cycleStartedAt, now, { nx: true });
  const final = await redis.get<number>(WR.cycleStartedAt);
  return typeof final === 'number' ? final : now;
}

export async function getDay(n: number): Promise<DayEntry | null> {
  if (n <= 0 || n > WRITERS_ROOM_TOTAL_DAYS) return null;
  const redis = getRedis();
  const day = await redis.get<DayEntry>(WR.day(n));
  return day || null;
}

export async function getDayState(n: number): Promise<DayState | null> {
  const redis = getRedis();
  return await redis.get<DayState>(WR.dayState(n));
}

// Aggregate state used by the GET /state route. Lazy-inits the cycle clock on
// the first call after a deploy/reset, so Day 1 submissions open the moment
// anyone visits — no admin seed needed.
export async function getState(): Promise<WritersRoomState> {
  const currentDay = await getCurrentDayNumber();
  const now = Date.now();

  if (currentDay <= 0) {
    const cycleStartedAt = await getOrInitCycleStartedAt();
    const votingClosesAt = cycleStartedAt + WRITERS_ROOM_VOTING_WINDOW_MS;
    const votingOpen = now < votingClosesAt;
    return {
      currentDay: 0,
      totalDays: WRITERS_ROOM_TOTAL_DAYS,
      publishedDay: null,
      votingClosesAt,
      votingOpen,
      submissionsOpenForDay: votingOpen ? 1 : null,
    };
  }

  const day = await getDay(currentDay);
  const votingClosesAt = day?.votingClosesAt ?? null;
  const votingOpen =
    votingClosesAt !== null && now < votingClosesAt && currentDay < WRITERS_ROOM_TOTAL_DAYS;
  const submissionsOpenForDay = votingOpen ? currentDay + 1 : null;

  return {
    currentDay,
    totalDays: WRITERS_ROOM_TOTAL_DAYS,
    publishedDay: day,
    votingClosesAt,
    votingOpen,
    submissionsOpenForDay,
  };
}

export async function listDays(): Promise<DayEntry[]> {
  const current = await getCurrentDayNumber();
  if (current <= 0) return [];
  const redis = getRedis();
  const keys = Array.from({ length: current }, (_, i) => WR.day(i + 1));
  const results = await redis.mget<DayEntry[]>(...keys);
  return results.filter((d): d is DayEntry => !!d);
}

// === Submissions ============================================================

export interface SubmissionWithVote extends Submission {
  liked?: boolean;
}

export async function listSubmissionsForDay(
  dayNumber: number,
  viewerAddress?: string,
): Promise<SubmissionWithVote[]> {
  const redis = getRedis();
  // ZSET sorted by like count desc.
  const ids = (await redis.zrange<string[]>(
    WR.submissions(dayNumber),
    0,
    -1,
    { rev: true },
  )) as string[];
  if (ids.length === 0) return [];

  const subKeys = ids.map((id) => WR.submission(id));
  const subs = (await redis.mget<Submission[]>(...subKeys)).filter(
    (s): s is Submission => !!s,
  );

  if (!viewerAddress) return subs;

  // Mark which submissions the viewer has liked.
  const likedSet = (await redis.smembers(
    WR.voteIndex(viewerAddress, dayNumber),
  )) as string[];
  const liked = new Set(likedSet);
  return subs.map((s) => ({ ...s, liked: liked.has(s.id) }));
}

export async function getSubmission(id: string): Promise<Submission | null> {
  const redis = getRedis();
  return (await redis.get<Submission>(WR.submission(id))) || null;
}

export interface VoterIdentity {
  address: string;
  handle: string | null;
  // True when this handle is bound to more than one address — the signal that
  // one identity may be voting from several wallets.
  reused: boolean;
}

export async function getSubmissionVoters(
  submissionId: string,
): Promise<VoterIdentity[]> {
  const redis = getRedis();
  const addrs = (await redis.smembers(WR.voters(submissionId))) as string[];
  if (addrs.length === 0) return [];

  const handles = await redis.mget<(string | null)[]>(
    ...addrs.map((a) => WR.addrHandle(a)),
  );
  const out: VoterIdentity[] = [];
  for (let i = 0; i < addrs.length; i++) {
    const handle = handles[i] || null;
    const reused = handle ? (await redis.scard(WR.handleAddrs(handle))) > 1 : false;
    out.push({ address: addrs[i], handle, reused });
  }
  return out;
}

export interface SubmitResult {
  ok: true;
  submission: Submission;
}

export class SubmitError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function submitForDay(
  dayNumber: number,
  submitterAddress: string,
  input: ValidatedSubmission,
): Promise<SubmitResult> {
  if (dayNumber < 1 || dayNumber > WRITERS_ROOM_TOTAL_DAYS) {
    throw new SubmitError(409, 'Submissions for this day are not open.');
  }

  const state = await getState();
  if (state.submissionsOpenForDay !== dayNumber) {
    throw new SubmitError(409, 'Submissions for this day are not open.');
  }

  const redis = getRedis();
  const address = submitterAddress.toLowerCase();

  // Bind identity before consuming the daily slot so a handle mismatch doesn't
  // burn the slot.
  try {
    await bindHandle(address, input.xHandle);
  } catch (e) {
    if (e instanceof HandleError) throw new SubmitError(e.status, e.message);
    throw e;
  }

  const onceKey = WR.submitOnce(address, dayNumber);

  // Atomic single-submission gate: SET NX with TTL covering the full voting window
  // plus a buffer in case publish is slightly late.
  const ttlMs = (state.votingClosesAt ?? Date.now() + WRITERS_ROOM_VOTING_WINDOW_MS) - Date.now() + 60_000;
  const claimed = await redis.set(onceKey, '1', { nx: true, px: Math.max(60_000, ttlMs) });
  if (claimed !== 'OK') {
    throw new SubmitError(429, 'You already submitted for this day.');
  }

  const submission: Submission = {
    id: generateSubmissionId(),
    dayNumber,
    submitterAddress: address,
    xHandle: input.xHandle,
    caption: input.caption,
    description: input.description,
    prompt: input.prompt,
    tokenIds: input.tokenIds,
    submittedAt: Date.now(),
    voteCount: 0,
    status: 'active',
  };

  // Persist submission JSON + register in the day's ZSET (score 0 to start).
  // No transaction here because the submission body must be writable before
  // it can appear in the index — failures roll back via the once-key TTL.
  await redis.set(WR.submission(submission.id), submission);
  await redis.zadd(WR.submissions(dayNumber), { score: 0, member: submission.id });

  return { ok: true, submission };
}

// === Voting =================================================================

export class VoteError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface VoteResult {
  liked: boolean;
  voteCount: number;
}

async function ensureVotingOpen(dayNumber: number): Promise<void> {
  // For Day 1, the voting window is the cycle window (no previous day record).
  // For Day N >= 2, the window lives on the previous day's record.
  let closesAt: number;
  if (dayNumber === 1) {
    const cycleStartedAt = await getOrInitCycleStartedAt();
    closesAt = cycleStartedAt + WRITERS_ROOM_VOTING_WINDOW_MS;
  } else {
    const prev = await getDay(dayNumber - 1);
    if (!prev) throw new VoteError(409, 'Voting window has not opened yet.');
    closesAt = prev.votingClosesAt;
  }
  if (Date.now() >= closesAt) {
    throw new VoteError(410, 'Voting has closed for this day.');
  }
}

export async function likeSubmission(
  submissionId: string,
  voterAddress: string,
  handle: string,
): Promise<VoteResult> {
  const submission = await getSubmission(submissionId);
  if (!submission) throw new VoteError(404, 'Submission not found.');

  const address = voterAddress.toLowerCase();
  if (submission.submitterAddress === address) {
    throw new VoteError(403, 'You cannot like your own submission.');
  }

  await ensureVotingOpen(submission.dayNumber);

  // Enforce a single identity per wallet before the vote is recorded.
  try {
    await bindHandle(address, handle);
  } catch (e) {
    if (e instanceof HandleError) throw new VoteError(e.status, e.message);
    throw e;
  }

  const redis = getRedis();
  // SADD returns 1 if added, 0 if already present. Use as guard against double-count.
  const added = await redis.sadd(WR.voters(submissionId), address);
  if (added === 0) {
    return { liked: true, voteCount: submission.voteCount };
  }

  // Increment counters atomically. ZINCRBY + denormalized counter on the JSON.
  const newScore = await redis.zincrby(
    WR.submissions(submission.dayNumber),
    1,
    submissionId,
  );
  await redis.sadd(WR.voteIndex(address, submission.dayNumber), submissionId);
  await redis.zincrby(WR.leaderboardLikes, 1, submission.submitterAddress);

  const updated: Submission = { ...submission, voteCount: Number(newScore) };
  await redis.set(WR.submission(submissionId), updated);
  return { liked: true, voteCount: updated.voteCount };
}

export async function unlikeSubmission(
  submissionId: string,
  voterAddress: string,
): Promise<VoteResult> {
  const submission = await getSubmission(submissionId);
  if (!submission) throw new VoteError(404, 'Submission not found.');

  const address = voterAddress.toLowerCase();
  await ensureVotingOpen(submission.dayNumber);

  const redis = getRedis();
  const removed = await redis.srem(WR.voters(submissionId), address);
  if (removed === 0) {
    return { liked: false, voteCount: submission.voteCount };
  }

  const newScore = await redis.zincrby(
    WR.submissions(submission.dayNumber),
    -1,
    submissionId,
  );
  await redis.srem(WR.voteIndex(address, submission.dayNumber), submissionId);
  await redis.zincrby(WR.leaderboardLikes, -1, submission.submitterAddress);

  const updated: Submission = {
    ...submission,
    voteCount: Math.max(0, Number(newScore)),
  };
  await redis.set(WR.submission(submissionId), updated);
  return { liked: false, voteCount: updated.voteCount };
}

// === Author edit / delete ===================================================

export class SubmissionMutationError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const MAX_HISTORY_VERSIONS = 50;

// Edit is allowed only by the author and only while the day's voting window is
// still open. Votes/score are preserved; the prior version is snapshotted.
export async function editSubmission(
  submissionId: string,
  editorAddress: string,
  input: ValidatedSubmission,
): Promise<Submission> {
  const submission = await getSubmission(submissionId);
  if (!submission) throw new SubmissionMutationError(404, 'Submission not found.');

  const address = editorAddress.toLowerCase();
  if (submission.submitterAddress !== address) {
    throw new SubmissionMutationError(403, 'You can only edit your own page.');
  }

  try {
    await ensureVotingOpen(submission.dayNumber);
  } catch {
    throw new SubmissionMutationError(410, 'Editing is closed for this page.');
  }

  const redis = getRedis();
  const now = Date.now();

  const snapshot = {
    caption: submission.caption,
    description: submission.description,
    prompt: submission.prompt,
    xHandle: submission.xHandle,
    tokenIds: submission.tokenIds,
    savedAt: now,
  };
  await redis.rpush(WR.submissionHistory(submissionId), JSON.stringify(snapshot));
  await redis.ltrim(WR.submissionHistory(submissionId), -MAX_HISTORY_VERSIONS, -1);

  const updated: Submission = {
    ...submission,
    caption: input.caption,
    description: input.description,
    prompt: input.prompt,
    xHandle: input.xHandle,
    tokenIds: input.tokenIds,
    edited: true,
    editedAt: now,
  };
  await redis.set(WR.submission(submissionId), updated);
  return updated;
}

// Delete is allowed only by the author and only while the day's voting window
// is still open. Cleans up index/voters/leaderboard and frees the daily slot.
export async function deleteSubmission(
  submissionId: string,
  requesterAddress: string,
): Promise<void> {
  const submission = await getSubmission(submissionId);
  if (!submission) throw new SubmissionMutationError(404, 'Submission not found.');

  const address = requesterAddress.toLowerCase();
  if (submission.submitterAddress !== address) {
    throw new SubmissionMutationError(403, 'You can only delete your own page.');
  }

  try {
    await ensureVotingOpen(submission.dayNumber);
  } catch {
    throw new SubmissionMutationError(410, 'Deleting is closed for this page.');
  }

  const redis = getRedis();
  const day = submission.dayNumber;

  // Reverse the likes this entry earned so the leaderboard stays honest.
  if (submission.voteCount > 0) {
    await redis.zincrby(WR.leaderboardLikes, -submission.voteCount, address);
  }

  const voters = (await redis.smembers(WR.voters(submissionId))) as string[];
  for (const voter of voters) {
    await redis.srem(WR.voteIndex(voter, day), submissionId);
  }

  await redis.zrem(WR.submissions(day), submissionId);
  await redis.del(WR.voters(submissionId));
  await redis.del(WR.submissionHistory(submissionId));
  await redis.del(WR.submission(submissionId));

  // Free the one-per-holder slot so the author can submit a fresh page.
  await redis.del(WR.submitOnce(address, day));
}

// === Day publish ============================================================

export class PublishError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export interface SeedDay1Input {
  caption: string;
  description: string;
  // Day 1 is text-only by spec, but we still allow op to attach an image
  // optionally if they ever change their mind.
  tokenId: number | null;
  imageUrl: string | null;
}

export async function seedDay1(input: SeedDay1Input): Promise<DayEntry> {
  const current = await getCurrentDayNumber();
  if (current >= 1) {
    throw new PublishError(409, 'Day 1 has already been seeded.');
  }
  const now = Date.now();
  const day: DayEntry = {
    dayNumber: 1,
    caption: input.caption,
    description: input.description,
    tokenId: input.tokenId,
    imageUrl: input.imageUrl,
    submitterAddress: null,
    publishedAt: now,
    votingClosesAt: now + WRITERS_ROOM_VOTING_WINDOW_MS,
    winnerSubmissionId: null,
  };
  const redis = getRedis();
  await redis.set(WR.day(1), day);
  await redis.set(WR.dayState(1), 'published');
  await redis.set(WR.currentDay, 1);
  return day;
}

export interface PublishNextDayInput {
  // op confirms the visual + final wording on top of the winning submission
  caption?: string;
  description?: string;
  tokenId?: number | null;
  imageUrl?: string | null;
}

export interface PublishResult {
  day: DayEntry;
  pickedSubmission: Submission | null;
  candidateCount: number;
}

export interface DaySelection {
  // The submission whose text becomes the page (story must advance).
  page: Submission | null;
  // The credited winner — only when one page is strictly ahead with >= 1 vote.
  winner: Submission | null;
  candidateCount: number;
}

// A day awards a winner only when a single page strictly leads with at least
// one vote. Ties (incl. 0-0) and zero-vote days award none. `scoresDesc` is the
// like counts sorted descending.
export function isCreditedWinner(scoresDesc: number[]): boolean {
  if (scoresDesc.length === 0) return false;
  const top = scoresDesc[0];
  if (top < 1) return false;
  return scoresDesc.filter((s) => s === top).length === 1;
}

// Select the page and (maybe) the winner for `forDay`.
//   - winner: awarded ONLY when a single page holds the top score and that
//     score is >= 1. Ties (0-0, 1-1, 2-2, ...) and zero-vote days award none.
//   - page: still chosen so the comic advances. Random among the tied leaders
//     when there's no clear winner.
async function selectForDay(forDay: number): Promise<DaySelection> {
  const redis = getRedis();
  const top = (await redis.zrange<string[]>(WR.submissions(forDay), 0, -1, {
    rev: true,
    withScores: true,
  })) as Array<string | number>;

  const pairs: Array<{ id: string; score: number }> = [];
  for (let i = 0; i < top.length; i += 2) {
    pairs.push({ id: String(top[i]), score: Number(top[i + 1]) });
  }
  if (pairs.length === 0) return { page: null, winner: null, candidateCount: 0 };

  const topScore = pairs[0].score;
  const tiedIds = pairs.filter((p) => p.score === topScore).map((p) => p.id);
  const credited = isCreditedWinner(pairs.map((p) => p.score));

  const pageId =
    tiedIds.length === 1
      ? tiedIds[0]
      : tiedIds[Math.floor(Math.random() * tiedIds.length)];
  const page = await getSubmission(pageId);
  const winner = credited ? page : null;

  return { page, winner, candidateCount: pairs.length };
}

export async function publishNextDay(
  override: PublishNextDayInput = {},
): Promise<PublishResult> {
  const redis = getRedis();
  const current = await getCurrentDayNumber();

  if (current >= WRITERS_ROOM_TOTAL_DAYS) {
    throw new PublishError(409, 'Run is complete.');
  }

  // The voting window we're closing belongs to the cycle when no day has
  // published yet, or to the most-recent published day otherwise.
  let votingClosesAt: number;
  let previousCaption: string;
  let previousDescription: string;
  if (current === 0) {
    const cycleStartedAt = await getOrInitCycleStartedAt();
    votingClosesAt = cycleStartedAt + WRITERS_ROOM_VOTING_WINDOW_MS;
    previousCaption = DAY_ZERO_CAPTION;
    previousDescription = DAY_ZERO_DESCRIPTION;
  } else {
    const previousDay = await getDay(current);
    if (!previousDay) {
      throw new PublishError(500, 'Current day record missing.');
    }
    votingClosesAt = previousDay.votingClosesAt;
    previousCaption = previousDay.caption;
    previousDescription = previousDay.description;
  }

  if (Date.now() < votingClosesAt) {
    throw new PublishError(409, 'Voting window has not closed yet.');
  }

  const nextDayNumber = current + 1;
  const { page, winner } = await selectForDay(nextDayNumber);

  // The page comes from the selected submission so the story advances even on
  // no-winner days. The winner (credit/badge/leaderboard) is awarded only on a
  // clear, voted result. Op can override the published wording on top.
  const baseCaption = override.caption ?? page?.caption ?? previousCaption;
  const baseDescription =
    override.description ?? page?.description ?? previousDescription;
  const baseTokenId =
    override.tokenId !== undefined
      ? override.tokenId
      : page?.tokenIds?.[0] ?? null;
  const baseImageUrl =
    override.imageUrl !== undefined ? override.imageUrl : null;

  if (!baseCaption || !baseDescription) {
    throw new PublishError(400, 'Caption and description are required.');
  }

  const now = Date.now();
  const newDay: DayEntry = {
    dayNumber: nextDayNumber,
    caption: baseCaption,
    description: baseDescription,
    tokenId: baseTokenId,
    imageUrl: baseImageUrl,
    submitterAddress: winner?.submitterAddress ?? null,
    publishedAt: now,
    votingClosesAt: now + WRITERS_ROOM_VOTING_WINDOW_MS,
    winnerSubmissionId: winner?.id ?? null,
    pageSubmissionId: page?.id ?? null,
  };

  await redis.set(WR.day(nextDayNumber), newDay);
  await redis.set(WR.dayState(nextDayNumber), 'published');
  await redis.set(WR.currentDay, nextDayNumber);

  // Mark the credited winner; everything else expires. No winner => all expire.
  const allIds = (await redis.zrange<string[]>(
    WR.submissions(nextDayNumber),
    0,
    -1,
  )) as string[];
  for (const id of allIds) {
    const sub = await getSubmission(id);
    if (!sub) continue;
    const status: Submission['status'] = id === winner?.id ? 'winner' : 'expired';
    await redis.set(WR.submission(id), { ...sub, status });
  }

  if (winner) {
    await redis.zincrby(WR.leaderboardContributions, 1, winner.submitterAddress);
  }

  await redis.set(WR.publishLog(nextDayNumber), {
    pickedAt: now,
    winnerId: winner?.id ?? null,
    pageId: page?.id ?? null,
    candidates: allIds.length,
  });

  return {
    day: newDay,
    pickedSubmission: winner,
    candidateCount: allIds.length,
  };
}

// === Leaderboard ============================================================

export async function getLeaderboard(limit = 50): Promise<LeaderboardResponse> {
  const redis = getRedis();
  const [contribRows, likeRows] = await Promise.all([
    redis.zrange<string[]>(WR.leaderboardContributions, 0, limit - 1, {
      rev: true,
      withScores: true,
    }),
    redis.zrange<string[]>(WR.leaderboardLikes, 0, limit - 1, {
      rev: true,
      withScores: true,
    }),
  ]);

  // We need both metrics on every row we return. ZSCORE the other set per row.
  const contribAddresses: string[] = [];
  const contribScores: number[] = [];
  for (let i = 0; i < contribRows.length; i += 2) {
    contribAddresses.push(String(contribRows[i]));
    contribScores.push(Number(contribRows[i + 1]));
  }
  const likeAddresses: string[] = [];
  const likeScores: number[] = [];
  for (let i = 0; i < likeRows.length; i += 2) {
    likeAddresses.push(String(likeRows[i]));
    likeScores.push(Number(likeRows[i + 1]));
  }

  // Resolve bound X handles for every address we're about to return.
  const allAddrs = Array.from(new Set([...contribAddresses, ...likeAddresses]));
  const handleByAddr = new Map<string, string | null>();
  if (allAddrs.length > 0) {
    const handles = await redis.mget<(string | null)[]>(
      ...allAddrs.map((a) => WR.addrHandle(a.toLowerCase())),
    );
    allAddrs.forEach((a, i) => handleByAddr.set(a, handles[i] || null));
  }

  const topContributions: LeaderboardRow[] = await Promise.all(
    contribAddresses.map(async (address, idx) => {
      const likes = await redis.zscore(WR.leaderboardLikes, address);
      return {
        address,
        handle: handleByAddr.get(address) ?? null,
        contributions: contribScores[idx],
        totalLikesReceived: Number(likes ?? 0),
      };
    }),
  );

  const topLikes: LeaderboardRow[] = await Promise.all(
    likeAddresses.map(async (address, idx) => {
      const contributions = await redis.zscore(
        WR.leaderboardContributions,
        address,
      );
      return {
        address,
        handle: handleByAddr.get(address) ?? null,
        contributions: Number(contributions ?? 0),
        totalLikesReceived: likeScores[idx],
      };
    }),
  );

  return { topContributions, topLikes };
}

// Used by the admin panel to seed Day 1 from a JSON body.
export async function seedDay1FromInput(input: DaySeedInput) {
  return await seedDay1(input);
}
