'use client';

import { use } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { getPost, POSTS } from '../posts';

const font = { fontFamily: 'var(--font-departure-mono)' };

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const post = getPost(slug);

  if (!post) notFound();

  const paragraphs = post.content.split('\n\n');
  const idx = POSTS.findIndex((p) => p.slug === slug);
  const newer = idx > 0 ? POSTS[idx - 1] : undefined;
  const older = idx >= 0 && idx < POSTS.length - 1 ? POSTS[idx + 1] : undefined;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="p-4 md:p-8 lg:p-12">
          <div className="w-full lg:grid lg:grid-cols-12">
            <div className="hidden lg:block lg:col-span-1" />
            <div className="lg:col-span-10">
              <article className="max-w-2xl space-y-10">

                {/* Back */}
                <Link
                  href="/blog"
                  className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  style={font}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  All posts
                </Link>

                {/* Header */}
                <header className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[10px] text-muted-foreground/60" style={font}>
                      {formatDate(post.date)}
                    </span>
                    {post.tags && post.tags.length > 0 && (
                      <span className="text-[10px] text-muted-foreground/40" style={font}>·</span>
                    )}
                    {post.tags?.map((tag) => (
                      <span
                        key={tag}
                        className="text-[9px] uppercase tracking-[0.15em] px-1.5 py-0.5 border border-neutral-300 dark:border-neutral-700 text-muted-foreground"
                        style={font}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <h1 className="text-2xl sm:text-3xl lg:text-4xl text-foreground leading-snug" style={font}>
                    {post.title}
                  </h1>
                  {post.summary && (
                    <p className="text-sm text-muted-foreground leading-relaxed pt-1" style={font}>
                      {post.summary}
                    </p>
                  )}
                </header>

                {/* Divider */}
                <div className="h-px bg-neutral-200/60 dark:bg-neutral-800" />

                {/* Content */}
                <div className="space-y-5">
                  {paragraphs.map((p, i) => (
                    <p
                      key={i}
                      className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap"
                      style={font}
                    >
                      {p}
                    </p>
                  ))}
                </div>

                {/* Next / Previous nav */}
                {(newer || older) && (
                  <nav className="pt-8 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {older ? (
                      <Link
                        href={`/blog/${older.slug}`}
                        className="group ring-1 ring-neutral-200/60 dark:ring-neutral-800 rounded-lg p-4 transition-all duration-300 hover:ring-neutral-400 dark:hover:ring-neutral-600"
                      >
                        <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/60 flex items-center gap-1" style={font}>
                          <ArrowLeft className="w-3 h-3" />
                          Older
                        </span>
                        <span className="block mt-2 text-xs text-foreground leading-snug" style={font}>
                          {older.title}
                        </span>
                      </Link>
                    ) : <span />}
                    {newer ? (
                      <Link
                        href={`/blog/${newer.slug}`}
                        className="group ring-1 ring-neutral-200/60 dark:ring-neutral-800 rounded-lg p-4 transition-all duration-300 hover:ring-neutral-400 dark:hover:ring-neutral-600 sm:text-right"
                      >
                        <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/60 flex items-center gap-1 sm:justify-end" style={font}>
                          Newer
                          <ArrowRight className="w-3 h-3" />
                        </span>
                        <span className="block mt-2 text-xs text-foreground leading-snug" style={font}>
                          {newer.title}
                        </span>
                      </Link>
                    ) : <span />}
                  </nav>
                )}

              </article>
            </div>
            <div className="hidden lg:block lg:col-span-1" />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
