'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Shuffle } from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { TokenLookup } from '@/components/ui/TokenLookup';

const font = { fontFamily: 'var(--font-departure-mono)' };

export default function WikiLandingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="p-4 md:p-8 lg:p-12">
          <div className="w-full lg:grid lg:grid-cols-12">
            <div className="hidden lg:block lg:col-span-1" />
            <div className="lg:col-span-10">
              <div className="space-y-3 mb-6">
                <Link
                  href="/studio"
                  className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                  style={font}
                >
                  <ArrowLeft className="w-3 h-3" /> Studio
                </Link>
                <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>BOOA Wiki</h1>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-lg" style={font}>
                  A living wiki page for every agent. Identity, on-chain provenance, ERC-8004 trail,
                  and a chronicle the Archivist keeps as the chain speaks. Every page is public and
                  compounds over time.
                </p>
              </div>

              <div className="max-w-lg space-y-6">
                <TokenLookup
                  onSubmit={(tokenId) => router.push(`/studio/wiki/${tokenId}`)}
                  buttonLabel="OPEN WIKI"
                  loadingLabel="OPENING..."
                />

                <button
                  type="button"
                  onClick={() => router.push(`/studio/wiki/${Math.floor(Math.random() * 3333)}`)}
                  className="inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                  style={font}
                >
                  <Shuffle className="w-3 h-3" /> Random page
                </button>

                <div className="border-2 border-neutral-700 dark:border-neutral-200 p-4 space-y-3">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground" style={font}>
                    Public API — no key required
                  </p>
                  <pre className="text-[11px] leading-relaxed text-foreground overflow-x-auto" style={font}>
{`GET /api/wiki/{tokenId}            JSON (markdown + meta)
GET /api/wiki/{tokenId}?format=md  raw markdown`}
                  </pre>
                  <p className="text-[11px] text-muted-foreground leading-relaxed" style={font}>
                    Token ids 0-3332. Wikilinks like [[42|NAME]] resolve to /api/wiki/42.
                    Also listed in{' '}
                    <a href="/llms.txt" target="_blank" rel="noopener noreferrer" className="text-[#7869c4] hover:underline">
                      llms.txt
                    </a>{' '}
                    for agents.
                  </p>
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
