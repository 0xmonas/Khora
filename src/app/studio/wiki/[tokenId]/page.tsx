'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronLeft, ChevronRight, FileText, FolderOpen, Link2, Copy, Check } from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { WikiMarkdown } from '@/components/features/wiki/WikiMarkdown';

const font = { fontFamily: 'var(--font-departure-mono)' };
const MAX_TOKEN_ID = 3332;

interface WikiConnection {
  id: number;
  name: string;
  why: string;
}

interface WikiData {
  tokenId: number;
  name: string;
  markdown: string;
  meta: {
    tokenId: number;
    name: string;
    creature: string;
    vibe: string;
    owner: string | null;
    revision: number;
    updatedAt: string;
    entries: number;
    connections: WikiConnection[];
  };
}

function fileName(id: number): string {
  return `booa-${String(id).padStart(4, '0')}.md`;
}

function shortAddr(addr: string): string {
  return addr.length > 12 ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : addr;
}

export default function WikiTokenPage() {
  const params = useParams<{ tokenId: string }>();
  const router = useRouter();
  const id = Number(params.tokenId);
  const valid = /^\d{1,4}$/.test(params.tokenId ?? '') && id <= MAX_TOKEN_ID;

  const [data, setData] = useState<WikiData | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [avatarOk, setAvatarOk] = useState(true);

  useEffect(() => {
    if (!valid) {
      setError(`Token id must be 0-${MAX_TOKEN_ID}.`);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError('');
    setData(null);
    setAvatarOk(true);
    fetch(`/api/wiki/${id}`)
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || `Request failed (${res.status})`);
        return res.json();
      })
      .then((json: WikiData) => { if (!cancelled) setData(json); })
      .catch((e: Error) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, valid]);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const nav = (to: number) => router.push(`/studio/wiki/${to}`);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="p-4 md:p-8 lg:p-12">
          <div className="w-full lg:grid lg:grid-cols-12">
            <div className="hidden lg:block lg:col-span-1" />
            <div className="lg:col-span-10 space-y-4">
              <Link
                href="/studio/wiki"
                className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                style={font}
              >
                <ArrowLeft className="w-3 h-3" /> BOOA Wiki
              </Link>

              <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-background shadow-sm" style={font}>
                <div className="flex items-center gap-2 px-3 py-2 border-b-2 border-neutral-700 dark:border-neutral-200">
                  <div className="flex gap-1.5 shrink-0">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#883932]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#bfce72]" />
                    <span className="w-2.5 h-2.5 rounded-full bg-[#55a049]" />
                  </div>
                  <div className="flex items-center gap-1.5 px-2 py-0.5 text-[11px] bg-neutral-100 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded-sm min-w-0">
                    <FileText className="w-3 h-3 text-[#7869c4] shrink-0" />
                    <span className="truncate">{valid ? fileName(id) : 'not-found.md'}</span>
                  </div>
                  <div className="flex-1" />
                  <div className="flex items-center gap-1 text-[10px] uppercase">
                    <button
                      type="button"
                      onClick={() => nav(Math.max(0, id - 1))}
                      disabled={!valid || id === 0}
                      className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label="Previous token"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => nav(Math.min(MAX_TOKEN_ID, id + 1))}
                      disabled={!valid || id === MAX_TOKEN_ID}
                      className="p-1 text-muted-foreground hover:text-foreground disabled:opacity-30"
                      aria-label="Next token"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href={`/api/wiki/${id}?format=md`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hidden sm:block px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
                    >
                      RAW
                    </a>
                    <a
                      href={`/api/wiki/${id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hidden sm:block px-1.5 py-0.5 text-muted-foreground hover:text-foreground"
                    >
                      JSON
                    </a>
                    <button
                      type="button"
                      onClick={copyLink}
                      className="p-1 text-muted-foreground hover:text-foreground"
                      aria-label="Copy link"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-[#55a049]" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                <div className="lg:grid lg:grid-cols-[210px_minmax(0,1fr)_230px]">
                  <aside className="hidden lg:block border-r border-neutral-200 dark:border-neutral-800 p-3 text-[11px]">
                    <p className="uppercase tracking-widest text-muted-foreground/60 mb-2">Vault</p>
                    <div className="space-y-1">
                      <p className="flex items-center gap-1.5 text-muted-foreground">
                        <FolderOpen className="w-3 h-3 text-[#7869c4]" /> khôra
                      </p>
                      <div className="pl-3 space-y-1">
                        <p className="flex items-center gap-1.5 text-muted-foreground">
                          <FolderOpen className="w-3 h-3 text-[#7869c4]" /> agents
                        </p>
                        <div className="pl-3 space-y-1">
                          <p className="flex items-center gap-1.5 text-[#7869c4] bg-[#7869c4]/10 px-1.5 py-0.5 -mx-1.5 rounded-sm">
                            <FileText className="w-3 h-3 shrink-0" />
                            <span className="truncate">{valid ? fileName(id) : '—'}</span>
                          </p>
                          {data?.meta.connections.map((c) => (
                            <Link
                              key={c.id}
                              href={`/studio/wiki/${c.id}`}
                              className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground px-1.5 py-0.5 -mx-1.5"
                            >
                              <FileText className="w-3 h-3 shrink-0" />
                              <span className="truncate">{fileName(c.id)}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  </aside>

                  <article className="p-4 sm:p-6 min-h-[420px]">
                    {loading && (
                      <p className="text-sm text-[#7869c4] animate-pulse">READING VAULT…</p>
                    )}
                    {!loading && error && (
                      <div className="space-y-2 text-sm">
                        <p className="text-[#883932]">ARCHIVE ERROR</p>
                        <p className="text-muted-foreground">{error}</p>
                      </div>
                    )}
                    {!loading && data && <WikiMarkdown markdown={data.markdown} />}
                  </article>

                  <aside className="border-t lg:border-t-0 lg:border-l border-neutral-200 dark:border-neutral-800 p-3 text-[11px] space-y-4">
                    {data && (
                      <>
                        {avatarOk && (
                          <img
                            src={`/api/agent-files/360/${data.tokenId}/avatar.svg`}
                            alt={data.name}
                            className="w-full aspect-square border border-neutral-200 dark:border-neutral-800"
                            style={{ imageRendering: 'pixelated' }}
                            onError={() => setAvatarOk(false)}
                          />
                        )}
                        <div>
                          <p className="uppercase tracking-widest text-muted-foreground/60 mb-2">Properties</p>
                          <dl className="space-y-1.5">
                            {[
                              ['token', `#${data.meta.tokenId}`],
                              ['creature', data.meta.creature],
                              ['vibe', data.meta.vibe],
                              ['holder', data.meta.owner ? shortAddr(data.meta.owner) : 'unknown'],
                              ['revision', String(data.meta.revision)],
                              ['entries', String(data.meta.entries)],
                              ['updated', data.meta.updatedAt.slice(0, 10)],
                            ].map(([k, v]) => (
                              <div key={k} className="flex justify-between gap-2">
                                <dt className="text-muted-foreground/60">{k}</dt>
                                <dd className="text-foreground text-right truncate">{v}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                        <div>
                          <p className="flex items-center gap-1.5 uppercase tracking-widest text-muted-foreground/60 mb-2">
                            <Link2 className="w-3 h-3" /> Linked mentions
                          </p>
                          {data.meta.connections.length === 0 && (
                            <p className="text-muted-foreground/60 italic">No close kin found.</p>
                          )}
                          <div className="space-y-2">
                            {data.meta.connections.map((c) => (
                              <Link key={c.id} href={`/studio/wiki/${c.id}`} className="block group">
                                <p className="text-[#7869c4] group-hover:underline truncate">
                                  <span className="opacity-50">[[</span>{c.name}<span className="opacity-50">]]</span>
                                </p>
                                <p className="text-muted-foreground/60 truncate">{c.why}</p>
                              </Link>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                  </aside>
                </div>

                <div className="flex items-center justify-between px-3 py-1.5 border-t border-neutral-200 dark:border-neutral-800 text-[10px] text-muted-foreground/60 uppercase tracking-wider">
                  <span>{data ? `rev ${data.meta.revision} · ${data.meta.entries} entries` : '—'}</span>
                  <span>{data ? `updated ${data.meta.updatedAt.slice(0, 10)}` : 'booa wiki'}</span>
                </div>
              </div>
            </div>
            <div className="hidden lg:block lg:col-span-1" />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
