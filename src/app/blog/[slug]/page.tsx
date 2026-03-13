'use client';

import { use } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { getPost } from '../posts';

const font = { fontFamily: 'var(--font-departure-mono)' };

export default function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const post = getPost(slug);

  if (!post) notFound();

  const paragraphs = post.content.split('\n\n');

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
                  href="/blog"
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  style={font}
                >
                  <ArrowLeft className="w-4 h-4" />
                  All posts
                </Link>

                {/* Header */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] text-muted-foreground/60" style={font}>
                      {post.date}
                    </span>
                    {post.tags?.map((tag) => (
                      <span
                        key={tag}
                        className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 border border-neutral-300 dark:border-neutral-600 text-muted-foreground"
                        style={font}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>
                    {post.title}
                  </h1>
                </div>

                {/* Content */}
                <div className="space-y-4">
                  {paragraphs.map((p, i) => (
                    <p
                      key={i}
                      className="text-sm text-muted-foreground leading-relaxed"
                      style={font}
                    >
                      {p}
                    </p>
                  ))}
                </div>

                {/* Footer nav */}
                <div className="pt-8 border-t border-border">
                  <Link
                    href="/blog"
                    className="text-sm text-foreground border-b border-foreground hover:opacity-70 transition-opacity"
                    style={font}
                  >
                    All posts
                  </Link>
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
