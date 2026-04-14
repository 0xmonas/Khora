'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { DOCS } from '../content';

const font = { fontFamily: 'var(--font-departure-mono)' };

function findPage(slug: string) {
  for (const section of DOCS) {
    const page = section.pages.find((p) => p.slug === slug);
    if (page) return { section, page };
  }
  return null;
}

function findAdjacentPages(slug: string) {
  const allPages = DOCS.flatMap((s) => s.pages);
  const idx = allPages.findIndex((p) => p.slug === slug);
  return {
    prev: idx > 0 ? allPages[idx - 1] : null,
    next: idx < allPages.length - 1 ? allPages[idx + 1] : null,
  };
}

export default function DocPage() {
  const params = useParams();
  const slug = params.slug as string;
  const result = findPage(slug);

  if (!result) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <h1 className="text-2xl text-foreground" style={font}>Page not found</h1>
            <Link href="/docs" className="text-sm text-muted-foreground hover:text-foreground" style={font}>
              Back to docs
            </Link>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const { section, page } = result;
  const { prev, next } = findAdjacentPages(slug);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="p-4 md:p-8 lg:p-12">
          <div className="w-full lg:grid lg:grid-cols-12">

            {/* Sidebar */}
            <div className="hidden lg:block lg:col-span-3 pr-8">
              <div className="sticky top-24 space-y-4">
                {DOCS.map((s) => (
                  <div key={s.slug}>
                    <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest mb-2" style={font}>
                      {s.title}
                    </p>
                    <div className="space-y-1">
                      {s.pages.map((p) => (
                        <Link
                          key={p.slug}
                          href={`/docs/${p.slug}`}
                          className={`block text-xs py-1 transition-colors ${
                            p.slug === slug
                              ? 'text-foreground'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                          style={font}
                        >
                          {p.title}
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Mobile back link */}
            <div className="lg:hidden mb-4">
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                style={font}
              >
                <ArrowLeft className="w-4 h-4" />
                Home
              </Link>
            </div>

            {/* Content */}
            <div className="lg:col-span-9">
              <div className="max-w-2xl">
                <div className="space-y-3 mb-8">
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest" style={font}>
                    {section.title}
                  </p>
                  <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>
                    {page.title}
                  </h1>
                  <p className="text-sm text-muted-foreground" style={font}>
                    {page.description}
                  </p>
                </div>

                <div className="space-y-4">
                  {page.content.split('\n\n').map((paragraph, i) => {
                    const trimmed = paragraph.trim();
                    if (!trimmed) return null;

                    // Code blocks
                    if (trimmed.startsWith('```')) {
                      const code = trimmed.replace(/```\w*\n?/, '').replace(/```$/, '');
                      return (
                        <pre
                          key={i}
                          className="bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 p-4 text-xs overflow-x-auto"
                          style={{ ...font, borderRadius: 6 }}
                        >
                          {code}
                        </pre>
                      );
                    }

                    // Lines starting with - are lists
                    if (trimmed.split('\n').every((l) => l.startsWith('- ') || l.startsWith('  '))) {
                      return (
                        <ul key={i} className="space-y-1 text-sm text-muted-foreground" style={font}>
                          {trimmed.split('\n').map((line, j) => (
                            <li key={j} className="flex gap-2">
                              <span className="text-foreground/40">—</span>
                              <span>{line.replace(/^-\s*/, '')}</span>
                            </li>
                          ))}
                        </ul>
                      );
                    }

                    // Headings
                    if (trimmed.startsWith('# ')) {
                      return <h2 key={i} className="text-lg text-foreground mt-6" style={font}>{trimmed.replace('# ', '')}</h2>;
                    }

                    // Subheadings (lines ending with :)
                    const lines = trimmed.split('\n');
                    if (lines.length === 1 && trimmed.endsWith(':') && trimmed.length < 60) {
                      return <h3 key={i} className="text-sm text-foreground mt-4" style={font}>{trimmed}</h3>;
                    }

                    // Regular paragraphs
                    return (
                      <p key={i} className="text-sm text-muted-foreground leading-relaxed" style={font}>
                        {trimmed.split('\n').map((line, j) => (
                          <span key={j}>
                            {line}
                            {j < trimmed.split('\n').length - 1 && <br />}
                          </span>
                        ))}
                      </p>
                    );
                  })}
                </div>

                {/* Navigation */}
                <div className="flex justify-between mt-12 pt-6 border-t border-neutral-700/30 dark:border-neutral-200/30">
                  {prev ? (
                    <Link href={`/docs/${prev.slug}`} className="text-sm text-muted-foreground hover:text-foreground transition-colors" style={font}>
                      ← {prev.title}
                    </Link>
                  ) : <div />}
                  {next ? (
                    <Link href={`/docs/${next.slug}`} className="text-sm text-muted-foreground hover:text-foreground transition-colors" style={font}>
                      {next.title} →
                    </Link>
                  ) : <div />}
                </div>

              </div>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
