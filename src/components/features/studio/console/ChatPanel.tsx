'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Square, Plus, Trash2, ChevronDown, Pencil } from 'lucide-react';
import { ConsoleConnection, consoleFetch } from './connection';
import { ConsoleSession, ConsoleMessage, extractText, sessionLabel } from './types';
import { readSSE } from './sse';
import { renderRich } from './richText';

const font = { fontFamily: 'var(--font-departure-mono)' };

// Telegram caps messages at 4096, so the agent already lives with this order of
// size — and the proxy rejects oversized bodies server-side regardless.
const MAX_MESSAGE_CHARS = 4000;

interface ChatEntry {
  role: 'user' | 'assistant' | 'tool';
  text: string;
  interrupted?: boolean;
}

// Real Hermes gateway slash commands, run over the console like any message.
// Telegram renders these as inline-keyboard cards inside its own adapter; the
// api_server has no button concept, so we drive the useful ones as buttons here.
const COMMANDS: { cmd: string; label: string; confirm?: string }[] = [
  { cmd: '/help', label: 'Help — list commands' },
  { cmd: '/usage', label: 'Usage & cost' },
  { cmd: '/skills', label: 'Skills' },
  { cmd: '/whoami', label: 'Who am I' },
  { cmd: '/compress', label: 'Compress history', confirm: 'Compress this conversation? The agent summarizes older turns to free up context.' },
  { cmd: '/reset', label: 'Reset conversation', confirm: 'Reset this conversation on the instance? The agent forgets the current thread.' },
];

interface SlashCommand {
  command: string;
  description: string;
}

// Shown until /console/commands answers (or when the template predates it).
const FALLBACK_SLASH: SlashCommand[] = [
  ...COMMANDS.map((c) => ({ command: c.cmd, description: c.label.replace(/^[^—]*— ?/, '') || c.label })),
  { command: '/model', description: 'Switch model' },
];

interface ChatPanelProps {
  conn: ConsoleConnection;
  active?: boolean;
  onActivity?: (summary?: string) => void;
}

export function ChatPanel({ conn, active = true, onActivity }: ChatPanelProps) {
  const [sessions, setSessions] = useState<ConsoleSession[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [slashCmds, setSlashCmds] = useState<SlashCommand[]>(FALLBACK_SLASH);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [cmdsOpen, setCmdsOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [creating, setCreating] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (active) endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [entries, active]);

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

  // Same registry Telegram's "/" menu is built from, served by the instance.
  const loadCommands = useCallback(async () => {
    try {
      const res = await consoleFetch(conn, '/commands');
      if (!res.ok) return;
      const d = await res.json();
      const list: SlashCommand[] = (d.commands || []).filter(
        (c: SlashCommand) => typeof c?.command === 'string' && c.command.startsWith('/') && typeof c?.description === 'string',
      );
      if (list.length > 0) setSlashCmds(list);
    } catch { /* fallback list stays */ }
  }, [conn]);

  useEffect(() => { void loadCommands(); }, [loadCommands]);

  // The create endpoint returns { session: { id } }; reading d.id gave undefined,
  // so the UI never switched and each click silently spawned another session.
  const createSession = async (): Promise<string | null> => {
    const res = await consoleFetch(conn, '/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    if (!res.ok) throw new Error(`create failed: ${res.status}`);
    const d = await res.json();
    const s = d.session || d;
    const id = s.id || s.session_id;
    if (!id) throw new Error('no session id in response');
    setSessions((prev) => [{ id, title: s.title ?? null, started_at: s.started_at }, ...prev]);
    return id;
  };

  const newSession = async () => {
    if (creating) return; // one create per click, not one per re-render
    setCreating(true);
    setError(null);
    try {
      const id = await createSession();
      if (id) {
        setSessionId(id);
        setEntries([]);
      }
    } catch {
      setError('Could not create a chat — is the gateway running?');
    } finally {
      setCreating(false);
    }
  };

  const renameSession = async (id: string, title: string) => {
    const next = title.trim();
    setRenamingId(null);
    if (!next) return;
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title: next } : s)));
    try {
      await consoleFetch(conn, `/api/sessions/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: next }),
      });
    } catch {
      setError('Could not rename this chat.');
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

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || streaming) return;
    if (Array.from(text).length > MAX_MESSAGE_CHARS) {
      setError(`Messages must be ${MAX_MESSAGE_CHARS.toLocaleString()} characters or fewer.`);
      return;
    }

    let sid = sessionId;
    if (!sid) {
      try {
        sid = await createSession();
        if (!sid) throw new Error();
        setSessionId(sid);
      } catch {
        setError('Could not create a chat — is the gateway running?');
        return;
      }
    }

    if (override === undefined) {
      setInput('');
      if (inputRef.current) inputRef.current.style.height = 'auto';
    }
    setError(null);
    setEntries((prev) => [...prev, { role: 'user', text }, { role: 'assistant', text: '' }]);
    setStreaming(true);
    setPhase('thinking');

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
          setPhase(null);
          appendAssistant(payload.delta);
        } else if (event === 'tool.started' && typeof payload.tool_name === 'string') {
          setPhase(`running ${payload.tool_name}`);
          setEntries((prev) => [...prev.slice(0, -1), { role: 'tool', text: payload.tool_name as string }, prev[prev.length - 1]]);
        } else if (event === 'tool.completed' || event === 'tool.failed') {
          setPhase('thinking');
        } else if (event === 'assistant.completed' && typeof payload.content === 'string') {
          setPhase(null);
          setAssistantFinal(payload.content);
          onActivity?.(payload.content.split('\n')[0].slice(0, 90));
        } else if (event === 'error') {
          setPhase(null);
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
      setPhase(null);
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
    <div className="flex flex-col h-[min(720px,calc(100vh-260px))] min-h-[540px]">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-neutral-100 dark:border-neutral-800">
        <div className="relative flex items-center gap-1.5">
          <button
            onClick={() => setSessionsOpen(!sessionsOpen)}
            className="flex items-center gap-1.5 text-[11px] hover:opacity-70 transition-opacity"
            style={font}
          >
            <span className="truncate max-w-[220px]">
              {activeSession ? sessionLabel(activeSession) : 'no chat'}
            </span>
            <ChevronDown className="w-3 h-3" />
          </button>
          <button
            onClick={newSession}
            disabled={creating}
            className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
            title="New chat"
          >
            <Plus className={`w-3.5 h-3.5 ${creating ? 'animate-pulse' : ''}`} />
          </button>
          {sessionsOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 w-64 max-h-52 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-800 bg-background shadow-lg chat-scrollbar">
              {sessions.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground" style={font}>No chats yet</div>
              )}
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors">
                  {renamingId === s.id ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => void renameSession(s.id, renameDraft)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void renameSession(s.id, renameDraft);
                        if (e.key === 'Escape') setRenamingId(null);
                      }}
                      maxLength={60}
                      placeholder="Name this chat"
                      className="flex-1 mx-2 my-1 px-2 py-1 text-xs rounded border border-neutral-200 dark:border-neutral-800 bg-background focus:outline-none focus:ring-1 focus:ring-neutral-400"
                      style={font}
                    />
                  ) : (
                    <>
                      <button
                        onClick={() => { setSessionId(s.id); setSessionsOpen(false); }}
                        className="flex-1 px-3 py-2 text-xs text-left truncate"
                        style={font}
                      >
                        {sessionLabel(s)}
                      </button>
                      <button
                        onClick={() => { setRenamingId(s.id); setRenameDraft(s.title || ''); }}
                        className="px-1.5 text-muted-foreground hover:text-foreground"
                        title="Rename chat"
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => void deleteSession(s.id)}
                        className="px-2 text-muted-foreground hover:text-red-500"
                        title="Delete chat"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <button
              onClick={() => { setCmdsOpen(!cmdsOpen); setModelsOpen(false); }}
              disabled={streaming}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors uppercase tracking-wider disabled:opacity-40"
              style={font}
            >
              commands
            </button>
            {cmdsOpen && (
              <div className="absolute top-full right-0 mt-1 z-50 w-56 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-background shadow-lg">
                {COMMANDS.map((c) => (
                  <button
                    key={c.cmd}
                    onClick={() => {
                      setCmdsOpen(false);
                      if (c.confirm && !confirm(c.confirm)) return;
                      void send(c.cmd);
                    }}
                    className="block w-full px-3 py-2 text-xs text-left hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
                    style={font}
                  >
                    <span className="text-muted-foreground">{c.cmd}</span> {c.label.replace(/^[^—]*— ?/, '') || c.label}
                  </button>
                ))}
                <p className="px-3 py-1.5 text-[9px] text-muted-foreground/60 border-t border-neutral-100 dark:border-neutral-800" style={font}>
                  Same commands as Telegram — you can also type any of them.
                </p>
              </div>
            )}
          </div>

          {models.length > 0 && (
            <div className="relative">
              <button
                onClick={() => { setModelsOpen(!modelsOpen); setCmdsOpen(false); }}
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
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 chat-scrollbar">
        {entries.length === 0 && (
          <p className="text-xs text-muted-foreground text-center pt-8" style={font}>
            Talk to your agent. Type / to browse every command, same as Telegram.
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
                className={`max-w-[min(80%,72ch)] px-3 py-2 text-xs leading-relaxed rounded-lg whitespace-pre-wrap break-words ${
                  e.role === 'user'
                    ? 'bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                    : 'bg-neutral-100 dark:bg-neutral-900'
                }`}
                style={font}
              >
                {e.role === 'assistant' && e.text
                  ? renderRich(e.text)
                  : e.text || (streaming && i === entries.length - 1 ? '…' : '')}
                {e.interrupted && <span className="text-[9px] uppercase opacity-60"> [interrupted]</span>}
              </div>
            </div>
          )
        ))}
        {streaming && phase && (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground uppercase tracking-wider" style={font}>
            <span className="inline-flex gap-0.5">
              <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
            {phase}
          </div>
        )}
        {error && <p className="text-xs text-red-500" style={font}>{error}</p>}
        <div ref={endRef} />
      </div>

      {input.startsWith('/') && !input.includes(' ') && (() => {
        const q = input.toLowerCase();
        const matches = slashCmds.filter((c) => c.command.toLowerCase().startsWith(q));
        if (matches.length === 0) return null;
        return (
          <div className="max-h-56 overflow-y-auto border-t border-neutral-100 dark:border-neutral-800 chat-scrollbar">
            {matches.map((c) => (
              <button
                key={c.command}
                onClick={() => { setInput(c.command + ' '); inputRef.current?.focus(); }}
                className="flex items-baseline gap-2 w-full px-4 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
                style={font}
              >
                <span className="text-xs shrink-0">{c.command}</span>
                <span className="text-[10px] text-muted-foreground truncate">{c.description}</span>
              </button>
            ))}
          </div>
        );
      })()}

      <div className="border-t border-neutral-100 dark:border-neutral-800 px-4 py-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            rows={1}
            value={input}
            maxLength={MAX_MESSAGE_CHARS}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Message your agent…"
            className="flex-1 resize-none max-h-32 overflow-y-auto px-3 py-2 text-xs rounded-md border border-neutral-200 dark:border-neutral-800 bg-background focus:outline-none focus:ring-1 focus:ring-neutral-400 chat-scrollbar"
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
          {input.length > MAX_MESSAGE_CHARS - 800 ? (
            <span className={input.length >= MAX_MESSAGE_CHARS ? 'text-amber-500' : ''}>
              {input.length.toLocaleString()}/{MAX_MESSAGE_CHARS.toLocaleString()}
            </span>
          ) : (
            <span>Enter to send · Shift+Enter for a new line</span>
          )}
          <span>history lives on your instance</span>
        </div>
      </div>
    </div>
  );
}
