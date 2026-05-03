'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { POSTS } from './posts';
import type { BlogPost } from './posts';

const font = { fontFamily: 'var(--font-departure-mono)' };

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function TagBadge({ tag }: { tag: string }) {
  return (
    <span
      className="text-[9px] uppercase tracking-[0.15em] px-1.5 py-0.5 border border-neutral-300 dark:border-neutral-700 text-muted-foreground"
      style={font}
    >
      {tag}
    </span>
  );
}

function FeaturedCard({ post }: { post: BlogPost }) {
  return (
    <Link href={`/blog/${post.slug}`} className="group block">
      <article className="relative ring-1 ring-neutral-200/60 dark:ring-neutral-800 rounded-lg p-6 sm:p-8 lg:p-10 transition-all duration-300 hover:ring-neutral-400 dark:hover:ring-neutral-600 bg-neutral-50/50 dark:bg-neutral-900/30">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-[9px] uppercase tracking-[0.15em] px-1.5 py-0.5 border border-green-600/80 dark:border-green-500/80 text-green-700 dark:text-green-400 bg-background/85 backdrop-blur-sm rounded-sm" style={font}>
            Latest
          </span>
          <span className="text-[10px] text-muted-foreground/60" style={font}>
            {formatDate(post.date)}
          </span>
        </div>

        <h2 className="text-xl sm:text-2xl lg:text-3xl text-foreground mb-4 leading-snug" style={font}>
          {post.title}
        </h2>

        <p className="text-sm text-muted-foreground leading-relaxed mb-6 max-w-2xl" style={font}>
          {post.summary}
        </p>

        <div className="flex items-end justify-between gap-4 flex-wrap">
          {post.tags && post.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {post.tags.map((tag) => <TagBadge key={tag} tag={tag} />)}
            </div>
          )}
          <span
            className="inline-flex items-center gap-1.5 text-xs text-foreground transition-transform duration-300 group-hover:translate-x-0.5"
            style={font}
          >
            Read post
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </article>
    </Link>
  );
}

function GridCard({ post }: { post: BlogPost }) {
  return (
    <Link href={`/blog/${post.slug}`} className="group block">
      <article className="relative h-full ring-1 ring-neutral-200/60 dark:ring-neutral-800 rounded-lg p-5 sm:p-6 transition-all duration-300 hover:ring-neutral-400 dark:hover:ring-neutral-600 flex flex-col">
        <span className="text-[10px] text-muted-foreground/60 mb-3" style={font}>
          {formatDate(post.date)}
        </span>

        <h3 className="text-base sm:text-lg text-foreground mb-3 leading-snug" style={font}>
          {post.title}
        </h3>

        <p className="text-xs text-muted-foreground leading-relaxed mb-5 line-clamp-3 flex-1" style={font}>
          {post.summary}
        </p>

        <div className="flex items-center justify-between gap-3 flex-wrap pt-3 border-t border-neutral-200/60 dark:border-neutral-800">
          {post.tags && post.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {post.tags.slice(0, 3).map((tag) => <TagBadge key={tag} tag={tag} />)}
            </div>
          ) : <span />}
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 transition-all duration-300" />
        </div>
      </article>
    </Link>
  );
}

export default function BlogPage() {
  const [featured, ...rest] = POSTS;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="p-4 md:p-8 lg:p-12">
          <div className="w-full lg:grid lg:grid-cols-12">
            <div className="hidden lg:block lg:col-span-1" />
            <div className="lg:col-span-10">

              {/* Title */}
              <div className="max-w-2xl space-y-3">
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest" style={font}>
                  BOOA
                </p>
                <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>
                  Blog
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-lg" style={font}>
                  Updates, announcements, and deep dives.
                </p>
              </div>

              {POSTS.length > 0 ? (
                <div className="mt-10 space-y-10">
                  {/* Featured (newest) */}
                  {featured && <FeaturedCard post={featured} />}

                  {/* Grid (rest) */}
                  {rest.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {rest.map((post) => (
                        <GridCard key={post.slug} post={post} />
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-10 ring-1 ring-dashed ring-neutral-300 dark:ring-neutral-700 rounded-lg p-12 flex items-center justify-center">
                  <p className="text-xs text-muted-foreground" style={font}>
                    No posts yet. Check back soon.
                  </p>
                </div>
              )}

            </div>
            <div className="hidden lg:block lg:col-span-1" />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
