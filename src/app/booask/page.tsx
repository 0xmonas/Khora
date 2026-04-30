'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Trash2, ExternalLink } from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import type { BooaskMessage } from '@/lib/booask/types';

const font = { fontFamily: 'var(--font-departure-mono)' };

const FAQ: { q: string; hint: string }[] = [
  { q: 'What is BOOA, in one paragraph?', hint: 'Collection overview' },
  { q: 'Show me BOOA #312 — name, traits, owner, and OpenSea link.', hint: 'Look up a token' },
  { q: 'What is the current floor and 24h volume?', hint: 'Market stats' },
  { q: 'Explain ERC-8004 like I am new to it.', hint: 'Concepts' },
  { q: 'How do I set up Hermes for my BOOA agent?', hint: 'Setup guide' },
  { q: 'What does the verified flag mean and why is it useful?', hint: 'Trust model' },
];

const URL_RE = /(https?:\/\/[^\s)]+)|(\b[\w-]+\.(?:booa\.app|khora\.fun|opensea\.io|shapescan\.xyz|etherscan\.io)[^\s)]*)/gi;
// Markdown image: ![alt](url) — capture both groups
const MD_IMAGE_RE = /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)/g;

function brandFor(url: string): { label: string; iconSrc?: string } {
  const u = url.toLowerCase();
  if (u.includes('opensea.io')) return { label: 'OpenSea', iconSrc: 'https://opensea.io/static/images/favicon/favicon.ico' };
  if (u.includes('booa.app') || u.includes('khora.fun')) return { label: 'BOOA', iconSrc: '/favicon.ico' };
  if (u.includes('shapescan.xyz')) return { label: 'Shapescan' };
  if (u.includes('etherscan.io')) return { label: 'Etherscan' };
  return { label: url.replace(/^https?:\/\//, '').split('/')[0] };
}

function renderLinks(text: string, keyPrefix: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const url = m[0].startsWith('http') ? m[0] : `https://${m[0]}`;
    const b = brandFor(url);
    parts.push(
      <a
        key={`${keyPrefix}-${m.index}-${url}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:opacity-80"
      >
        {b.iconSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.iconSrc} alt="" width={11} height={11} className="inline-block" />
        ) : (
          <ExternalLink className="inline-block w-3 h-3" />
        )}
        <span>{b.label}</span>
      </a>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

function renderText(text: string) {
  // First split on markdown images, render each as <img>; render the rest of the text via renderLinks
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  MD_IMAGE_RE.lastIndex = 0;
  let imgIdx = 0;
  while ((m = MD_IMAGE_RE.exec(text)) !== null) {
    if (m.index > last) {
      out.push(...renderLinks(text.slice(last, m.index), `t${imgIdx}`));
    }
    const alt = m[1];
    const src = m[2];
    out.push(
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={`img-${m.index}-${imgIdx}`}
        src={src}
        alt={alt}
        className="block my-2 rounded-md max-w-[200px] w-full h-auto bg-neutral-100 dark:bg-neutral-800"
        style={{ imageRendering: 'pixelated' }}
        loading="lazy"
      />,
    );
    last = m.index + m[0].length;
    imgIdx++;
  }
  if (last < text.length) {
    out.push(...renderLinks(text.slice(last), `t${imgIdx}`));
  }
  return out;
}

export default function BooaskPage() {
  const [messages, setMessages] = useState<BooaskMessage[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [userApiKey, setUserApiKey] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, pending]);

  useEffect(() => {
    if (!pending) inputRef.current?.focus();
  }, [pending]);

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    if (quotaExceeded && !userApiKey) return;

    setError(null);
    const userMsg: BooaskMessage = { role: 'user', text: trimmed };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setPending(true);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (userApiKey) headers['x-gemini-key'] = userApiKey;

      const res = await fetch('/api/booask', {
        method: 'POST',
        headers,
        body: JSON.stringify({ message: trimmed, history: messages }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 429 && data?.quotaExceeded) {
        setQuotaExceeded(true);
        if (data.reply) {
          setMessages([...next, { role: 'model', text: data.reply }]);
        }
        return;
      }
      if (!res.ok) {
        setError(data?.error || `BOOASK error (${res.status})`);
        return;
      }
      if (data.usingOwnKey) setQuotaExceeded(true);
      const reply = typeof data.reply === 'string' ? data.reply : 'No reply.';
      setMessages([...next, { role: 'model', text: reply }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setPending(false);
    }
  }, [messages, pending, quotaExceeded, userApiKey]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const inputDisabled = pending || (quotaExceeded && !userApiKey);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="p-4 md:p-8 lg:p-12">
          <div className="w-full lg:grid lg:grid-cols-12">
            <div className="hidden lg:block lg:col-span-2" />
            <div className="lg:col-span-8 space-y-4">
              <div className="space-y-1">
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest" style={font}>
                  BOOA
                </p>
                <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>
                  BOOASK
                </h1>
                <p className="text-xs text-muted-foreground leading-relaxed max-w-xl" style={font}>
                  hi. ask me anything about a BOOA, an agent, or how any of this works. I read every doc and every blog so you don&apos;t have to.
                </p>
              </div>

              <div className="flex flex-col h-[min(560px,calc(100vh-260px))] min-h-[420px] rounded-lg border border-neutral-200 dark:border-neutral-800 bg-background overflow-hidden shadow-sm">
                {/* Top bar */}
                <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-neutral-900 dark:bg-neutral-100 flex items-center justify-center">
                      <span
                        className="text-[11px] font-bold leading-none text-white dark:text-black"
                        style={font}
                      >
                        B
                      </span>
                    </div>
                    <span className="text-xs text-foreground" style={font}>BOOASK</span>
                    <span className="text-[10px] text-muted-foreground/50" style={font}>oracle</span>
                  </div>
                  <button
                    onClick={clearChat}
                    disabled={messages.length === 0}
                    className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-30"
                    title="Clear chat"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2.5 chat-scrollbar">
                  {messages.length === 0 && !pending && (
                    <div className="flex flex-col h-full">
                      <div className="text-center py-4">
                        <p className="text-xs text-muted-foreground" style={font}>
                          Ask anything about BOOA, agents, or the studio
                        </p>
                        <p className="text-[10px] text-muted-foreground/50 mt-1" style={font}>
                          Try one of these to get started
                        </p>
                      </div>
                      <div className="grid gap-1.5 sm:grid-cols-2 mt-2">
                        {FAQ.map((f) => (
                          <button
                            key={f.q}
                            onClick={() => send(f.q)}
                            className="text-left rounded-lg border border-neutral-200 dark:border-neutral-800 px-3 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-800/40 transition-colors group"
                            style={font}
                          >
                            <p className="text-[9px] uppercase tracking-widest text-muted-foreground/50 mb-0.5">
                              {f.hint}
                            </p>
                            <p className="text-[11px] text-foreground leading-snug">
                              {f.q}
                            </p>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {messages.map((m, i) => (
                    <div
                      key={i}
                      className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] px-3 py-2 text-xs leading-relaxed rounded-lg ${
                          m.role === 'user'
                            ? 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black'
                            : 'bg-neutral-50 dark:bg-neutral-800/60 text-foreground'
                        }`}
                        style={font}
                      >
                        {m.role === 'model' && (
                          <span className="block text-[10px] text-muted-foreground/70 mb-0.5">
                            BOOASK
                          </span>
                        )}
                        <p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                          {renderText(m.text)}
                        </p>
                      </div>
                    </div>
                  ))}

                  {pending && (
                    <div className="flex justify-start">
                      <div
                        className="bg-neutral-50 dark:bg-neutral-800/60 px-3 py-2 text-xs rounded-lg"
                        style={font}
                      >
                        <span className="block text-[10px] text-muted-foreground/70 mb-0.5">
                          BOOASK
                        </span>
                        <span className="inline-flex gap-1">
                          <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 bg-muted-foreground/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </span>
                      </div>
                    </div>
                  )}

                  {error && (
                    <div className="flex justify-center">
                      <p className="text-[10px] text-red-500 dark:text-red-400" style={font}>
                        {error}
                      </p>
                    </div>
                  )}

                  <div ref={chatEndRef} />
                </div>

                {/* BYOK prompt when quota exhausted */}
                {quotaExceeded && (
                  <div className="border-t border-neutral-100 dark:border-neutral-800 px-4 py-2 bg-neutral-50/50 dark:bg-neutral-800/20">
                    <div className="flex gap-2 items-center">
                      <input
                        type="password"
                        value={userApiKey}
                        onChange={(e) => setUserApiKey(e.target.value.trim())}
                        placeholder="Paste your Gemini API key to keep going..."
                        className="flex-1 px-3 py-1.5 text-[10px] bg-background rounded text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600"
                        style={font}
                      />
                      {userApiKey && (
                        <span className="text-[10px] text-green-600 dark:text-green-500" style={font}>&#10003;</span>
                      )}
                    </div>
                    <p className="text-[9px] text-muted-foreground/50 mt-1" style={font}>
                      Daily limit reached. Your key is sent per-request, never stored. Get one free at ai.google.dev
                    </p>
                  </div>
                )}

                {/* Input */}
                <div className="border-t border-neutral-100 dark:border-neutral-800 px-4 py-3">
                  <div className="flex gap-2">
                    <textarea
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value.slice(0, 800))}
                      onKeyDown={handleKeyDown}
                      placeholder={
                        quotaExceeded && !userApiKey
                          ? 'Add your API key above to continue...'
                          : 'Ask about a BOOA, an agent, or how it works...'
                      }
                      rows={1}
                      className="flex-1 px-3 py-2 text-xs bg-neutral-50 dark:bg-neutral-800/40 rounded-lg text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-600"
                      style={font}
                      disabled={inputDisabled}
                      autoFocus
                    />
                    <button
                      onClick={() => send(input)}
                      disabled={!input.trim() || inputDisabled}
                      className="px-3 py-2 rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black hover:bg-neutral-800 dark:hover:bg-neutral-200 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      <Send className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex justify-between mt-1.5">
                    <span className="text-[10px] text-muted-foreground/35" style={font}>
                      {input.length}/800
                    </span>
                    <span className="text-[10px] text-muted-foreground/35" style={font}>
                      {quotaExceeded && userApiKey ? 'Using your API key' : 'Enter to send'}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground/40" style={font}>
                Read-only. BOOASK never signs transactions or moves funds. For wallet actions, use BOOA Studio or Hermes.
              </p>
            </div>
            <div className="hidden lg:block lg:col-span-2" />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
