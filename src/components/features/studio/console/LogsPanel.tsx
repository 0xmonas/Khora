'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Pause, Eraser } from 'lucide-react';
import { ConsoleConnection, consoleFetch } from './connection';
import { readSSE } from './sse';

const font = { fontFamily: 'var(--font-departure-mono)' };
const MAX_LINES = 2000;

export function LogsPanel({ conn }: { conn: ConsoleConnection }) {
  const [lines, setLines] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const start = useCallback(async () => {
    setError(null);
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const res = await consoleFetch(conn, '/logs/stream', {
        headers: { Accept: 'text/event-stream' },
        signal: abort.signal,
      });
      if (!res.ok) {
        setError(res.status === 429 ? 'Too many log viewers open on this instance.' : 'Could not open the log stream.');
        return;
      }
      await readSSE(res, (_event, data) => {
        setLines((prev) => {
          const next = [...prev, data];
          return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next;
        });
      });
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setError('Log stream disconnected.');
    }
  }, [conn]);

  useEffect(() => {
    if (!paused) void start();
    return () => abortRef.current?.abort();
  }, [paused, start]);

  useEffect(() => {
    if (stickToBottom.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  return (
    <div className="flex flex-col h-[min(720px,calc(100vh-260px))] min-h-[540px]">
      <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-100 dark:border-neutral-800">
        <span className="text-[10px] text-muted-foreground" style={font}>
          In-memory buffer — last 1,000 lines, cleared on restart. Full logs live in Railway.
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPaused(!paused)}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title={paused ? 'Resume' : 'Pause'}
          >
            {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={() => setLines([])}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="Clear view"
          >
            <Eraser className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto px-4 py-3 bg-neutral-950 chat-scrollbar"
      >
        {lines.length === 0 && !error && (
          <p className="text-[11px] text-neutral-500" style={font}>Waiting for output…</p>
        )}
        {lines.map((l, i) => (
          <div key={i} className="text-[11px] leading-relaxed text-neutral-300 whitespace-pre-wrap break-all" style={font}>
            {l}
          </div>
        ))}
        {error && <p className="text-[11px] text-red-400" style={font}>{error}</p>}
      </div>
    </div>
  );
}
