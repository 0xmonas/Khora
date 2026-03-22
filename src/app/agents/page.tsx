'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { TokenLookup } from '@/components/ui/TokenLookup';

const font = { fontFamily: 'var(--font-departure-mono)' };

export default function AgentsPage() {
  const router = useRouter();

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
                  href="/studio"
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  style={font}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to Studio
                </Link>

                {/* Title */}
                <div className="space-y-3">
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest" style={font}>
                    BOOA Studio
                  </p>
                  <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>
                    Ident Cards
                  </h1>
                  <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                    Look up any BOOA agent by token ID. View on-chain pixel art, traits, and ERC-8004 identity.
                  </p>
                </div>

              </div>

              {/* Search Card — centered in full col-span-10 */}
              <div className="mt-8 flex justify-center">
                <TokenLookup
                  onSubmit={(id, chain) => router.push(`/agent/${chain}/${id}`)}
                  buttonLabel="VIEW IDENT CARD"
                />
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
