'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Square, Plus, Trash2, ChevronDown } from 'lucide-react';
import { ConsoleConnection, consoleFetch } from './connection';
import { ConsoleSession, ConsoleMessage, extractText } from './types';
import { readSSE } from './sse';

const font = { fontFamily: 'var(--font-departure-mono)' };

interface ChatEntry {
  role: 'user' | 'assistant' | 'tool';
  text: string;
  interrupted?: boolean;
}

const SLASH_HINTS = '/help /model /reset /usage /compress /skills';

export function ChatPanel({ conn }: { conn: ConsoleConnection }) {
  const [sessions, setSessions] = useState<ConsoleSession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [modelsOpen, setModelsOpen] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const loadSessions = useCallback(async () => {
    try {
      const res = await consoleFetch(conn, '/api/sessions?source=api_server&limit=50');
      if (!res.ok) return;
      const d = await res.json();
      const list: ConsoleSession[] = (d.data || d.sessions || []).map((s: ConsoleSession) => s);
      setSessions(list);
      if (list.length > 0 && !sessionId) setSessionId(list[0].id);
    } catch { /* unreachable — surfaced on next action */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn]);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  useEffect(() => {
    if (!sessionId) {
      setEntries([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await consoleFetch(conn, `/api/sessions/${encodeURIComponent(sessionId)}/messages`);
        if (!res.ok || cancelled) return;
        const d = await res.json();
        const mapped: ChatEntry[] = (d.data || [])
          .filter((m: ConsoleMessage) => m.role === 'user' || m.role === 'assistant')
          .map((m: ConsoleMessage) => ({
            role: m.role as 'user' | 'assistant',
            text: extractText(m.content),
          }))
          .filter((e: ChatEntry) => e.text.trim().length > 0);
        if (!cancelled) setEntries(mapped);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [conn, sessionId]);

  const loadModels = useCallback(async () => {
    try {
      let res = await consoleFetch(conn, '/api/model/options');
      if (res.status === 404) {
        res = await consoleFetch(conn, '/v1/models');
        if (!res.ok) return;
        const d = await res.json();
        setModels((d.data || []).map((m: { id: string }) => m.id).filter(Boolean));
        return;
      }
      if (!res.ok) return;
      const d = await res.json();
      const opts = d.options || d.models || d.data || [];
      setModels(opts.map((o: string | { id?: string; name?: string }) =>
        typeof o === 'string' ? o : (o.id || o.name || '')).filter(Boolean));
    } catch { /* ignore */ }
  }, [conn]);

  useEffect(() => { void loadModels(); }, [loadModels]);

  const newSession = async () => {
    try {
      const res = await consoleFetch(conn, '/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      if (!res.ok) return;
      const d = await res.json();
      const id = d.id || d.session_id;
      if (id) {
        setSessions((prev) => [{ id, title: null }, ...prev]);
        setSessionId(id);
        setEntries([]);
      }
    } catch {
      setError('Could not create a session — is the gateway running?');
    }
  };

  const deleteSession = async (id: string) => {
    if (!confirm('Delete this chat? Its history on the instance is removed.')) return;
    try {
      await consoleFetch(conn, `/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (sessionId === id) {
        setSessionId(null);
        setEntries([]);
      }
    } catch { /* ignore */ }
  };

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;

    let sid = sessionId;
    if (!sid) {
      try {
        const res = await consoleFetch(conn, '/api/sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        const d = await res.json();
        sid = d.id || d.session_id;
        if (!sid) throw new Error();
        setSessions((prev) => [{ id: sid as string, title: null }, ...prev]);
        setSessionId(sid);
      } catch {
        setError('Could not create a session — is the gateway running?');
        return;
      }
    }

    setInput('');
    setError(null);
    setEntries((prev) => [...prev, { role: 'user', text }, { role: 'assistant', text: '' }]);
    setStreaming(true);

    const abort = new AbortController();
    abortRef.current = abort;

    const appendAssistant = (delta: string) => {
      setEntries((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].role === 'assistant') {
            next[i] = { ...next[i], text: next[i].text + delta };
            break;
          }
        }
        return next;
      });
    };

    const setAssistantFinal = (content: string, interrupted = false) => {
      setEntries((prev) => {
        const next = [...prev];
        for (let i = next.length - 1; i >= 0; i--) {
          if (next[i].role === 'assistant') {
            next[i] = { role: 'assistant', text: content || next[i].text, interrupted };
            break;
          }
        }
        return next;
      });
    };

    try {
      const res = await consoleFetch(conn, `/api/sessions/${encodeURIComponent(sid)}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        body: JSON.stringify({ message: text }),
        signal: abort.signal,
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setAssistantFinal('', true);
        setError(typeof d?.error === 'string' ? d.error : 'The instance rejected the message.');
        return;
      }
      await readSSE(res, (event, data) => {
        let payload: Record<string, unknown> = {};
        try { payload = JSON.parse(data); } catch { return; }
        if (event === 'assistant.delta' && typeof payload.delta === 'string') {
          appendAssistant(payload.delta);
        } else if (event === 'tool.started' && typeof payload.tool_name === 'string') {
          setEntries((prev) => [...prev.slice(0, -1), { role: 'tool', text: payload.tool_name as string }, prev[prev.length - 1]]);
        } else if (event === 'assistant.completed' && typeof payload.content === 'string') {
          setAssistantFinal(payload.content);
        } else if (event === 'error') {
          setAssistantFinal('', true);
          setError(typeof payload.message === 'string' ? payload.message : 'Stream error.');
        }
      });
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') {
        setAssistantFinal('', true);
      } else {
        setAssistantFinal('', true);
        setError('Connection lost mid-reply. The instance keeps the authoritative history — reopen this chat to sync.');
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
    }
  };

  const stop = () => abortRef.current?.abort();

  const applyModel = (model: string) => {
    setModelsOpen(false);
    setInput(`/model ${model}`);
    inputRef.current?.focus();
  };

  const activeSession = sessions.find((s) => s.id === sessionId) || null;

  return (
    <div className="flex flex-col h-[min(520px,calc(100vh-320px))] min-h-[380px]">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-neutral-100 dark:border-neutral-800">
        <div className="relative flex items-center gap-1.5">
          <button
            onClick={() => setSessionsOpen(!sessionsOpen)}
            className="flex items-center gap-1.5 text-[11px] hover:opacity-70 transition-opacity"
            style={font}
          >
            <span className="truncate max-w-[160px]">
              {activeSession ? (activeSession.title || `chat ${activeSession.id.slice(0, 8)}`) : 'no chat'}
            </span>
            <ChevronDown className="w-3 h-3" />
          </button>
          <button
            onClick={newSession}
            className="text-muted-foreground hover:text-foreground transition-colors"
            title="New chat"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          {sessionsOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 w-64 max-h-52 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-800 bg-background shadow-lg chat-scrollbar">
              {sessions.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground" style={font}>No chats yet</div>
              )}
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors">
                  <button
                    onClick={() => { setSessionId(s.id); setSessionsOpen(false); }}
                    className="flex-1 px-3 py-2 text-xs text-left truncate"
                    style={font}
                  >
                    {s.title || `chat ${s.id.slice(0, 8)}`}
                  </button>
                  <button
                    onClick={() => void deleteSession(s.id)}
                    className="px-2 text-muted-foreground hover:text-red-500"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {models.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setModelsOpen(!modelsOpen)}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider"
              style={font}
            >
              model
            </button>
            {modelsOpen && (
              <div className="absolute top-full right-0 mt-1 z-50 w-64 max-h-52 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-800 bg-background shadow-lg chat-scrollbar">
                {models.map((m) => (
                  <button
                    key={m}
                    onClick={() => applyModel(m)}
                    className="block w-full px-3 py-2 text-xs text-left truncate hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
                    style={font}
                  >
                    {m}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 chat-scrollbar">
        {entries.length === 0 && (
          <p className="text-xs text-muted-foreground text-center pt-8" style={font}>
            Talk to your agent. Slash commands work like in Telegram: {SLASH_HINTS}
          </p>
        )}
        {entries.map((e, i) => (
          e.role === 'tool' ? (
            <div key={i} className="text-[10px] text-muted-foreground uppercase tracking-wider" style={font}>
              ⚙ {e.text}
            </div>
          ) : (
            <div key={i} className={`flex ${e.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] px-3 py-2 text-xs leading-relaxed rounded-lg whitespace-pre-wrap ${
                  e.role === 'user'
                    ? 'bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                    : 'bg-neutral-100 dark:bg-neutral-900'
                }`}
                style={font}
              >
                {e.text || (streaming && i === entries.length - 1 ? '…' : '')}
                {e.interrupted && <span className="text-[9px] uppercase opacity-60"> [interrupted]</span>}
              </div>
            </div>
          )
        ))}
        {error && <p className="text-xs text-red-500" style={font}>{error}</p>}
        <div ref={endRef} />
      </div>

      {input.startsWith('/') && (
        <div className="px-4 py-1 text-[10px] text-muted-foreground border-t border-neutral-100 dark:border-neutral-800" style={font}>
          {SLASH_HINTS}
        </div>
      )}

      <div className="border-t border-neutral-100 dark:border-neutral-800 px-4 py-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Message your agent…"
            className="flex-1 resize-none px-3 py-2 text-xs rounded-md border border-neutral-200 dark:border-neutral-800 bg-background focus:outline-none focus:ring-1 focus:ring-neutral-400"
            style={font}
          />
          {streaming ? (
            <button
              onClick={stop}
              className="px-3 rounded-md border border-neutral-200 dark:border-neutral-800 text-muted-foreground hover:text-foreground transition-colors"
              title="Stop"
            >
              <Square className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => void send()}
              disabled={!input.trim()}
              className="px-3 rounded-md bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 disabled:opacity-40 transition-opacity"
              title="Send"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground" style={font}>
          <span>Enter to send · Shift+Enter for a new line</span>
          <span>history lives on your instance</span>
        </div>
      </div>
    </div>
  );
}
