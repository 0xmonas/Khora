'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Heart, Loader2, PenLine, Send, Trophy, X } from 'lucide-react';
import { useHolderAuth } from '@/hooks/useAuth';
import { sfx } from '@/lib/sounds';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/components/ui/dialog';
import {
  CAPTION_MAX,
  DESCRIPTION_MAX,
  MAX_TOKEN_TAGS_PER_SUBMISSION,
  PROMPT_MAX,
  TOKEN_ID_MAX,
  WRITERS_ROOM_TOTAL_DAYS,
  type DayEntry,
  type LeaderboardResponse,
  type Submission,
  type WritersRoomState,
} from '@/lib/writers-room/types';
import { DAY_ZERO_CAPTION, DAY_ZERO_DESCRIPTION } from '@/lib/writers-room/origin';

const DAY_ZERO_ENTRY: DayEntry = {
  dayNumber: 0,
  caption: DAY_ZERO_CAPTION,
  description: DAY_ZERO_DESCRIPTION,
  tokenId: null,
  imageUrl: null,
  submitterAddress: null,
  publishedAt: 0,
  votingClosesAt: 0,
  winnerSubmissionId: null,
};

const font = { fontFamily: 'var(--font-departure-mono)' };
const fieldClass =
  'w-full bg-transparent border border-neutral-300 dark:border-neutral-700 px-2 py-1.5 text-xs text-foreground outline-none focus:border-foreground transition-colors';
const buttonPrimary =
  'border border-foreground bg-foreground px-3 py-1.5 text-[11px] text-background hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity';
const sectionLabel =
  'text-[10px] uppercase tracking-widest text-muted-foreground/60';

const TAG_RE = /(?<![\w#])#(\d{1,5})\b/g;
const CHAIN_ID = 360;

interface SubmissionView extends Submission {
  liked?: boolean;
}

interface StateResponse {
  state: WritersRoomState;
  days: DayEntry[];
}

function shortAddr(a: string | null): string {
  if (!a) return 'op';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function useCountdown(targetMs: number | null): string {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!targetMs) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [targetMs]);
  if (!targetMs) return '';
  const diff = targetMs - now;
  if (diff <= 0) return 'closed';
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return `${h.toString().padStart(2, '0')}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
}

function extractTagsClient(text: string): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  const matches = Array.from(text.matchAll(TAG_RE));
  for (const m of matches) {
    const n = Number.parseInt(m[1], 10);
    if (!Number.isInteger(n) || n < 0 || n > TOKEN_ID_MAX) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(n);
    if (out.length >= MAX_TOKEN_TAGS_PER_SUBMISSION) break;
  }
  return out;
}

// Renders a description with #NNN tags swapped for inline chips.
function DescriptionWithTokens({ text }: { text: string }) {
  if (!text) return null;
  const parts: Array<{ kind: 'text' | 'tag'; value: string }> = [];
  let lastIdx = 0;
  const matches = Array.from(text.matchAll(TAG_RE));
  for (const m of matches) {
    const start = m.index ?? 0;
    if (start > lastIdx) {
      parts.push({ kind: 'text', value: text.slice(lastIdx, start) });
    }
    parts.push({ kind: 'tag', value: m[1] });
    lastIdx = start + m[0].length;
  }
  if (lastIdx < text.length) {
    parts.push({ kind: 'text', value: text.slice(lastIdx) });
  }
  return (
    <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
      {parts.map((p, i) =>
        p.kind === 'text' ? (
          <span key={i}>{p.value}</span>
        ) : (
          <TokenInlineTag key={i} tokenId={Number.parseInt(p.value, 10)} />
        ),
      )}
    </p>
  );
}

function TokenInlineTag({ tokenId }: { tokenId: number }) {
  return (
    <span className="inline-flex items-center gap-1 align-middle border border-foreground/40 bg-foreground/5 px-1.5 py-0.5 text-[10px] mx-0.5">
      <TokenAvatar tokenId={tokenId} size={14} />
      #{tokenId}
    </span>
  );
}

function TokenAvatar({ tokenId, size = 32 }: { tokenId: number; size?: number }) {
  const src = `/api/agent-files/${CHAIN_ID}/${tokenId}/avatar.svg`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`BOOA #${tokenId}`}
      width={size}
      height={size}
      style={{ imageRendering: 'pixelated', width: size, height: size }}
      loading="lazy"
      onError={(e) => {
        e.currentTarget.style.display = 'none';
      }}
    />
  );
}

export function WritersRoomClient() {
  const { address, isConnected, isAuthenticated, isHolder } = useHolderAuth();

  const [data, setData] = useState<StateResponse | null>(null);
  const [submissions, setSubmissions] = useState<SubmissionView[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardResponse | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [proposeOpen, setProposeOpen] = useState(false);

  const fetchState = useCallback(async () => {
    const res = await fetch('/api/writers-room/state', { cache: 'no-store' });
    if (!res.ok) return;
    const json = (await res.json()) as StateResponse;
    setData(json);
    // Default selection: latest published community day, or Day 0 (origin) if
    // no community day has published yet.
    setSelectedDay((prev) => prev ?? json.state.currentDay);
  }, []);

  const fetchSubmissions = useCallback(async (n: number) => {
    const res = await fetch(`/api/writers-room/submissions/${n}`, {
      cache: 'no-store',
    });
    if (!res.ok) {
      setSubmissions([]);
      return;
    }
    const json = (await res.json()) as { submissions: SubmissionView[] };
    setSubmissions(json.submissions);
  }, []);

  const fetchLeaderboard = useCallback(async () => {
    const res = await fetch('/api/writers-room/leaderboard');
    if (!res.ok) return;
    setLeaderboard((await res.json()) as LeaderboardResponse);
  }, []);

  useEffect(() => {
    fetchState();
    fetchLeaderboard();
  }, [fetchState, fetchLeaderboard]);

  useEffect(() => {
    if (!data?.state.submissionsOpenForDay) {
      setSubmissions([]);
      return;
    }
    fetchSubmissions(data.state.submissionsOpenForDay);
  }, [data?.state.submissionsOpenForDay, fetchSubmissions, isAuthenticated]);

  const countdown = useCountdown(data?.state.votingClosesAt ?? null);

  const currentDayEntry = useMemo<DayEntry | null>(() => {
    if (!data) return null;
    if (selectedDay === 0) return DAY_ZERO_ENTRY;
    if (selectedDay === null) return data.state.publishedDay ?? DAY_ZERO_ENTRY;
    const found = data.days.find((d) => d.dayNumber === selectedDay);
    return found ?? data.state.publishedDay ?? DAY_ZERO_ENTRY;
  }, [data, selectedDay]);

  async function toggleLike(s: SubmissionView) {
    if (!isHolder || !isAuthenticated) return;
    const method = s.liked ? 'DELETE' : 'POST';
    sfx.playClick();
    const res = await fetch('/api/writers-room/vote', {
      method,
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ submissionId: s.id }),
    });
    if (!res.ok) {
      sfx.playError();
      return;
    }
    if (data?.state.submissionsOpenForDay) {
      fetchSubmissions(data.state.submissionsOpenForDay);
    }
    fetchLeaderboard();
  }

  const canPropose =
    isConnected && isAuthenticated && isHolder && data?.state.votingOpen === true;

  return (
    <div className="p-4 md:p-8 lg:p-12" style={font}>
      <div className="w-full lg:grid lg:grid-cols-12">
        <div className="hidden lg:block lg:col-span-1" />
        <div className="lg:col-span-10">
          <div className="mb-8 max-w-2xl space-y-6">
            <Link
              href="/studio"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Studio
            </Link>
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">
                BOOA Studio
              </p>
              <h1 className="text-2xl sm:text-3xl text-foreground">Writers Room</h1>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
                30 days. One comic. Holders write the story. The day&apos;s
                most-liked page becomes the next one in the comic. The visual
                editor is op-managed.
              </p>
            </div>
            {data?.state.votingOpen && (
              <button
                type="button"
                onClick={() => {
                  sfx.playClick();
                  setProposeOpen(true);
                }}
                className={`${buttonPrimary} flex items-center gap-2 px-4 py-2 text-xs uppercase`}
              >
                <PenLine className="w-3.5 h-3.5" /> Propose the next page
              </button>
            )}
          </div>

          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
            <main className="min-w-0 space-y-6">
            {/* Status strip */}
            <div className="grid grid-cols-3 gap-4 border-y border-neutral-300 dark:border-neutral-700 py-3">
              <div>
                <p className={sectionLabel}>Current</p>
                <p className="text-sm">
                  {!data || data.state.currentDay === 0
                    ? 'Origin'
                    : `Day ${data.state.currentDay} / ${WRITERS_ROOM_TOTAL_DAYS}`}
                </p>
              </div>
              <div>
                <p className={sectionLabel}>Voting closes in</p>
                <p className="text-sm tabular-nums">{countdown || '—'}</p>
              </div>
              <div>
                <p className={sectionLabel}>Status</p>
                <p className="text-sm">
                  {data?.state.votingOpen
                    ? 'proposals open'
                    : data?.state.currentDay === WRITERS_ROOM_TOTAL_DAYS
                      ? 'cycle complete'
                      : 'awaiting publish'}
                </p>
              </div>
            </div>

            {/* Timeline */}
            {data && (
              <div>
                <p className={`${sectionLabel} mb-2`}>Pages so far</p>
                <div className="flex gap-1 overflow-x-auto pb-1">
                  {[DAY_ZERO_ENTRY, ...data.days].map((d) => {
                    const active = (selectedDay ?? data.state.currentDay) === d.dayNumber;
                    return (
                      <button
                        key={d.dayNumber}
                        type="button"
                        onClick={() => setSelectedDay(d.dayNumber)}
                        className={`min-w-[44px] px-2 py-1.5 text-[10px] uppercase border transition-colors ${
                          active
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900'
                        }`}
                      >
                        D{d.dayNumber}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Day view */}
            {currentDayEntry && <DayView day={currentDayEntry} />}

            {/* Submissions */}
            {data?.state.submissionsOpenForDay && (
              <section className="space-y-3">
                <div className="flex items-baseline justify-between">
                  <h2 className="text-sm uppercase tracking-widest">
                    Proposals for Day {data.state.submissionsOpenForDay}
                  </h2>
                  <span className="text-[10px] text-muted-foreground/70">
                    {submissions.length}{' '}
                    {submissions.length === 1 ? 'page' : 'pages'}
                  </span>
                </div>
                {submissions.length === 0 ? (
                  <div className="border border-dashed border-neutral-300 dark:border-neutral-700 p-8 text-center text-sm text-muted-foreground">
                    No pages yet. Be the first to write the next one.
                  </div>
                ) : (
                  <ul className="space-y-3">
                    {submissions.map((s) => {
                      const isOwn =
                        address?.toLowerCase() === s.submitterAddress;
                      return (
                        <li
                          key={s.id}
                          className="border border-neutral-300 dark:border-neutral-700 hover:border-foreground/60 transition-colors p-4 space-y-2"
                        >
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60">
                              {shortAddr(s.submitterAddress)}
                              {isOwn && ' · you'}
                            </p>
                            <button
                              type="button"
                              onClick={() => toggleLike(s)}
                              disabled={
                                !isHolder || !isAuthenticated || isOwn
                              }
                              title={
                                isOwn
                                  ? "You can't like your own page"
                                  : !isAuthenticated
                                    ? 'Sign in to vote'
                                    : !isHolder
                                      ? 'Holder only'
                                      : ''
                              }
                              className={`inline-flex items-center gap-1.5 border px-2 py-1 text-[11px] transition-colors ${
                                s.liked
                                  ? 'border-foreground bg-foreground text-background'
                                  : 'border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900'
                              } disabled:opacity-40 disabled:cursor-not-allowed`}
                            >
                              <Heart
                                className={`w-3 h-3 ${s.liked ? 'fill-current' : ''}`}
                              />
                              {s.voteCount}
                            </button>
                          </div>
                          <p className="text-base font-medium leading-snug">
                            {s.caption}
                          </p>
                          <DescriptionWithTokens text={s.description} />
                          {s.tokenIds.length > 0 && (
                            <div className="flex flex-wrap gap-2 pt-2">
                              {s.tokenIds.map((id) => (
                                <div
                                  key={id}
                                  className="flex flex-col items-center gap-1 border border-neutral-300 dark:border-neutral-700 p-1.5 w-16"
                                >
                                  <TokenAvatar tokenId={id} size={48} />
                                  <span className="text-[10px] tabular-nums">
                                    #{id}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                          <details className="text-[10px] text-muted-foreground/70">
                            <summary className="cursor-pointer hover:text-foreground transition-colors">
                              visual prompt
                            </summary>
                            <p className="mt-1 whitespace-pre-wrap leading-relaxed">
                              {s.prompt}
                            </p>
                          </details>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </section>
            )}
          </main>

          {/* Sidebar */}
          <aside className="space-y-6 min-w-0 lg:sticky lg:top-6 lg:self-start">
            <LeaderboardSidebar data={leaderboard} />
          </aside>
          </div>
        </div>
      </div>

      <ProposeDialog
        open={proposeOpen}
        onOpenChange={setProposeOpen}
        canPropose={canPropose}
        isConnected={isConnected}
        isAuthenticated={isAuthenticated}
        isHolder={isHolder}
        currentDay={data?.state.currentDay ?? 0}
        targetDay={data?.state.submissionsOpenForDay ?? null}
        onSubmitted={() => {
          if (data?.state.submissionsOpenForDay) {
            fetchSubmissions(data.state.submissionsOpenForDay);
          }
        }}
      />
    </div>
  );
}

function DayView({ day }: { day: DayEntry }) {
  const label = day.dayNumber === 0 ? 'Day 0 · Origin' : `Day ${day.dayNumber}`;
  return (
    <article className="border border-neutral-300 dark:border-neutral-700 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
          {label}
          {day.tokenId !== null && ` · BOOA #${day.tokenId}`}
        </p>
        {day.submitterAddress && (
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/70">
            written by {shortAddr(day.submitterAddress)}
          </p>
        )}
      </div>
      {day.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={day.imageUrl}
          alt={`Day ${day.dayNumber}`}
          className="w-full max-w-md mx-auto border border-neutral-300 dark:border-neutral-700"
          style={{ imageRendering: 'pixelated' }}
        />
      )}
      <p className="text-lg leading-snug">{day.caption}</p>
      <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
        {day.description}
      </p>
    </article>
  );
}

function LeaderboardSidebar({ data }: { data: LeaderboardResponse | null }) {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Trophy className="w-3.5 h-3.5" />
          <p className="text-sm uppercase tracking-widest">Leaderboard</p>
        </div>
        <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
          30-day rolling. Resets when the cycle ends.
        </p>
      </div>

      <section className="space-y-2">
        <p className={sectionLabel}>Top contributors</p>
        {!data || data.topContributions.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No winning pages yet.
          </p>
        ) : (
          <ol className="space-y-1">
            {data.topContributions.slice(0, 10).map((row, i) => (
              <li
                key={row.address}
                className="flex items-center justify-between text-[11px] border-b border-neutral-200 dark:border-neutral-800 py-1.5"
              >
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground/50 tabular-nums w-4">
                    {i + 1}
                  </span>
                  {shortAddr(row.address)}
                </span>
                <span className="tabular-nums">
                  {row.contributions}{' '}
                  <span className="text-muted-foreground/60">
                    {row.contributions === 1 ? 'win' : 'wins'}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="space-y-2">
        <p className={sectionLabel}>Most-liked writers</p>
        {!data || data.topLikes.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No likes yet.</p>
        ) : (
          <ol className="space-y-1">
            {data.topLikes.slice(0, 10).map((row, i) => (
              <li
                key={row.address}
                className="flex items-center justify-between text-[11px] border-b border-neutral-200 dark:border-neutral-800 py-1.5"
              >
                <span className="flex items-center gap-2">
                  <span className="text-muted-foreground/50 tabular-nums w-4">
                    {i + 1}
                  </span>
                  {shortAddr(row.address)}
                </span>
                <span className="tabular-nums">
                  {row.totalLikesReceived}{' '}
                  <span className="text-muted-foreground/60">
                    {row.totalLikesReceived === 1 ? 'like' : 'likes'}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

interface ProposeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canPropose: boolean;
  isConnected: boolean;
  isAuthenticated: boolean;
  isHolder: boolean;
  currentDay: number;
  targetDay: number | null;
  onSubmitted: () => void;
}

function ProposeDialog({
  open,
  onOpenChange,
  canPropose,
  isConnected,
  isAuthenticated,
  isHolder,
  currentDay,
  targetDay,
  onSubmitted,
}: ProposeDialogProps) {
  const [caption, setCaption] = useState('');
  const [description, setDescription] = useState('');
  const [prompt, setPrompt] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Reset state when modal closes.
  useEffect(() => {
    if (!open) {
      setSubmitMsg(null);
      setSubmitError(null);
    }
  }, [open]);

  const tags = useMemo(() => extractTagsClient(description), [description]);

  async function handleSubmit() {
    setSubmitMsg(null);
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/writers-room/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          caption: caption.trim(),
          description: description.trim(),
          prompt: prompt.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setSubmitError(json?.error || 'Submission failed.');
        sfx.playError();
        return;
      }
      sfx.playSuccess();
      setSubmitMsg('Locked in. No edits — keep an eye on the votes.');
      setCaption('');
      setDescription('');
      setPrompt('');
      onSubmitted();
    } catch {
      setSubmitError('Network error. Try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle style={font}>
            Propose Day {targetDay ?? '—'}
          </DialogTitle>
          <DialogClose
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </DialogClose>
        </DialogHeader>

        <div className="p-4 space-y-4" style={font}>
          {!isConnected ? (
            <p className="text-xs text-muted-foreground">
              Connect your wallet to propose the next page.
            </p>
          ) : !isAuthenticated ? (
            <p className="text-xs text-muted-foreground">
              Sign in with your wallet to propose a page.
            </p>
          ) : !isHolder ? (
            <p className="text-xs text-muted-foreground">
              Proposing a page is open to BOOA holders only.
            </p>
          ) : (
            <>
              <ul className="text-[11px] text-muted-foreground/80 space-y-0.5 leading-relaxed">
                <li>· One page per holder per day. No edits after submit.</li>
                <li>· You can&apos;t like your own page.</li>
                <li>
                  · Tag any BOOA inline with #1234 (max{' '}
                  {MAX_TOKEN_TAGS_PER_SUBMISSION}, optional).
                </li>
              </ul>

              <div className="space-y-1">
                <div className="flex justify-between items-baseline">
                  <p className={sectionLabel}>Caption</p>
                  <span className="text-[9px] text-muted-foreground/50 tabular-nums">
                    {caption.length}/{CAPTION_MAX}
                  </span>
                </div>
                <input
                  value={caption}
                  onChange={(e) =>
                    setCaption(e.target.value.slice(0, CAPTION_MAX))
                  }
                  placeholder="One line, like a comic panel caption."
                  maxLength={CAPTION_MAX}
                  className={fieldClass}
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-baseline">
                  <p className={sectionLabel}>Story</p>
                  <span className="text-[9px] text-muted-foreground/50 tabular-nums">
                    {description.length}/{DESCRIPTION_MAX}
                  </span>
                </div>
                <textarea
                  value={description}
                  onChange={(e) =>
                    setDescription(e.target.value.slice(0, DESCRIPTION_MAX))
                  }
                  rows={5}
                  maxLength={DESCRIPTION_MAX}
                  placeholder="What happens on this page? Drop #1496 inline to tag any BOOA."
                  className={`${fieldClass} resize-y leading-snug`}
                />
                {tags.length > 0 && (
                  <div className="space-y-2 pt-2">
                    <div className="flex flex-wrap gap-2">
                      {tags.map((id) => (
                        <div
                          key={id}
                          className="flex flex-col items-center gap-1 border border-neutral-300 dark:border-neutral-700 p-1.5 w-20"
                        >
                          <TokenAvatar tokenId={id} size={64} />
                          <span className="text-[10px] tabular-nums">
                            #{id}
                          </span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
                      Tagged BOOAs will appear in your page. Make sure each
                      {tags.length === 1 ? ' one' : ' of them'} reads as a
                      natural continuation of Day {currentDay} — not a random
                      face. The op uses these as a guide when picking the visual.
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <div className="flex justify-between items-baseline">
                  <p className={sectionLabel}>Visual prompt</p>
                  <span className="text-[9px] text-muted-foreground/50 tabular-nums">
                    {prompt.length}/{PROMPT_MAX}
                  </span>
                </div>
                <textarea
                  value={prompt}
                  onChange={(e) =>
                    setPrompt(e.target.value.slice(0, PROMPT_MAX))
                  }
                  rows={4}
                  maxLength={PROMPT_MAX}
                  placeholder="Composition, framing, mood. The op uses this as a starting point."
                  className={`${fieldClass} resize-y leading-snug`}
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t border-neutral-200 dark:border-neutral-800">
                <p className="text-[10px] text-muted-foreground/70">
                  Submitting locks your page. No edits.
                </p>
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={
                    !canPropose ||
                    submitting ||
                    !caption.trim() ||
                    !description.trim() ||
                    !prompt.trim()
                  }
                  className={`${buttonPrimary} flex items-center gap-2`}
                >
                  {submitting ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Send className="w-3 h-3" />
                  )}
                  Submit (locked)
                </button>
              </div>

              {submitMsg && (
                <p className="text-[11px] text-foreground">{submitMsg}</p>
              )}
              {submitError && (
                <p className="text-[11px] text-red-600">{submitError}</p>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
