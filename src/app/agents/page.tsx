'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';

const font = { fontFamily: 'var(--font-departure-mono)' };

export default function AgentsPage() {
  const router = useRouter();
  const [tokenId, setTokenId] = useState('');
  const [network, setNetwork] = useState<'mainnet' | 'testnet'>('testnet');
  const [error, setError] = useState('');

  const chain = network === 'mainnet' ? 'shape' : 'shape-sepolia';

  const handleSearch = () => {
    const id = Number(tokenId);
    if (!Number.isInteger(id) || id < 0) {
      setError('Enter a valid Token ID');
      return;
    }
    setError('');
    router.push(`/agent/${chain}/${id}`);
  };

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

                {/* Search Card */}
                <div className="max-w-sm border-2 border-neutral-700 dark:border-neutral-200 p-5 space-y-5">
                  {/* Network toggle */}
                  <div>
                    <label className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5 block" style={font}>
                      Network
                    </label>
                    <div className="flex">
                      <button
                        type="button"
                        onClick={() => setNetwork('mainnet')}
                        className={`flex-1 py-2 border-2 border-neutral-700 dark:border-neutral-200 text-xs transition-colors ${
                          network === 'mainnet'
                            ? 'bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900'
                            : 'bg-white dark:bg-neutral-900 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                        }`}
                        style={font}
                      >
                        Shape
                      </button>
                      <button
                        type="button"
                        onClick={() => setNetwork('testnet')}
                        className={`flex-1 py-2 border-2 border-l-0 border-neutral-700 dark:border-neutral-200 text-xs transition-colors ${
                          network === 'testnet'
                            ? 'bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900'
                            : 'bg-white dark:bg-neutral-900 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                        }`}
                        style={font}
                      >
                        Shape Sepolia
                      </button>
                    </div>
                  </div>

                  {/* Token ID input */}
                  <div>
                    <label className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5 block" style={font}>
                      Token ID
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={tokenId}
                      onChange={(e) => { setTokenId(e.target.value); setError(''); }}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                      placeholder="0"
                      className="w-full p-2.5 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 text-sm outline-none placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
                      style={font}
                    />
                  </div>

                  {/* Error */}
                  {error && (
                    <p className="text-[10px] text-red-500" style={font}>{error}</p>
                  )}

                  {/* Search button */}
                  <button
                    onClick={handleSearch}
                    disabled={!tokenId}
                    className="w-full h-11 border-2 border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900 text-xs hover:bg-neutral-600 dark:hover:bg-neutral-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    style={font}
                  >
                    VIEW IDENT CARD
                  </button>
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
