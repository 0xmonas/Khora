'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { POSTS } from './posts';

const font = { fontFamily: 'var(--font-departure-mono)' };

export default function BlogPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="p-4 md:p-8 lg:p-12">
          <div className="w-full lg:grid lg:grid-cols-12">
            <div className="hidden lg:block lg:col-span-1" />
            <div className="lg:col-span-10">
              <div className="max-w-2xl space-y-8">

                {/* Back */}
                <Link
                  href="/"
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  style={font}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Home
                </Link>

                {/* Title */}
                <div className="space-y-3">
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest" style={font}>
                    BOOA
                  </p>
                  <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>
                    Blog
                  </h1>
                  <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                    Updates, announcements, and deep dives.
                  </p>
                </div>

                {/* Post list */}
                {POSTS.length > 0 ? (
                  <div className="space-y-4">
                    {POSTS.map((post) => (
                      <Link
                        key={post.slug}
                        href={`/blog/${post.slug}`}
                        className="block border-2 border-neutral-700 dark:border-neutral-200 p-4 sm:p-5 hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="space-y-1.5 min-w-0">
                            <h2 className="text-sm text-foreground" style={font}>
                              {post.title}
                            </h2>
                            <p className="text-xs text-muted-foreground leading-relaxed" style={font}>
                              {post.summary}
                            </p>
                            {post.tags && post.tags.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 pt-1">
                                {post.tags.map((tag) => (
                                  <span
                                    key={tag}
                                    className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 border border-neutral-300 dark:border-neutral-600 text-muted-foreground"
                                    style={font}
                                  >
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground/60 flex-shrink-0 mt-0.5" style={font}>
                            {post.date}
                          </span>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="border-2 border-dashed border-neutral-300 dark:border-neutral-600 p-8 flex items-center justify-center">
                    <p className="text-xs text-muted-foreground" style={font}>
                      No posts yet. Check back soon.
                    </p>
                  </div>
                )}

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
