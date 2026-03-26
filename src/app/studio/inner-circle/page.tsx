'use client';

import { useState, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { useSiweStatus } from '@/components/providers/siwe-provider';

const font = { fontFamily: 'var(--font-departure-mono)' };
const goldBloom = { color: '#c8b439', textShadow: '0 0 8px rgba(200,180,57,0.6), 0 0 20px rgba(200,180,57,0.2)' };
const dimText = { color: '#999' };

export default function InnerCirclePage() {
  const siweStatus = useSiweStatus();
  const { isConnected } = useAccount();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleJoin = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/holders-chat');
      const data = await res.json();
      if (res.ok && data.url) {
        window.open(data.url, '_blank', 'noopener,noreferrer');
      } else if (res.status === 401) {
        setError('Please connect your wallet and sign in first.');
      } else if (res.status === 403) {
        setError(`You need at least ${data.required} BOOAs to join. You currently hold ${data.current}.`);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const isAuth = siweStatus === 'authenticated';

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md space-y-8" style={font}>
          {/* Header */}
          <div className="text-center space-y-3">
            <p className="text-[10px] uppercase tracking-widest" style={dimText}>
              BOOA HOLDERS ONLY
            </p>
            <h1 className="text-2xl sm:text-3xl" style={goldBloom}>
              Inner Circle
            </h1>
            <p className="text-xs leading-relaxed text-muted-foreground max-w-sm mx-auto">
              Exclusive X group chat for BOOA holders. Minimum 3 BOOAs required to join.
            </p>
          </div>

          {/* Requirements */}
          <div className="border-2 border-neutral-700 dark:border-neutral-200 p-6 space-y-4">
            <p className="text-[10px] uppercase tracking-widest" style={dimText}>
              REQUIREMENTS
            </p>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-green-500' : 'bg-neutral-600'}`} />
                <span className="text-xs text-muted-foreground">
                  Connect wallet
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className={`w-2 h-2 rounded-full shrink-0 ${isAuth ? 'bg-green-500' : 'bg-neutral-600'}`} />
                <span className="text-xs text-muted-foreground">
                  Sign in (SIWE)
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-2 h-2 rounded-full bg-neutral-600 shrink-0" />
                <span className="text-xs text-muted-foreground">
                  Hold 3+ BOOAs
                </span>
              </div>
            </div>
          </div>

          {/* Action */}
          <div className="space-y-3">
            <button
              onClick={handleJoin}
              disabled={loading || !isAuth}
              className="w-full h-12 border-2 border-neutral-700 dark:border-neutral-200 bg-transparent text-sm text-foreground hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? 'Verifying...' : !isConnected ? 'Connect Wallet First' : !isAuth ? 'Sign In First' : 'Join Inner Circle'}
            </button>

            {error && (
              <p className="text-xs text-red-500 dark:text-red-400 text-center">
                {error}
              </p>
            )}
          </div>

          {/* Note */}
          <p className="text-[9px] text-center text-muted-foreground/50 leading-relaxed">
            Your wallet balance is verified on-chain. The invite link is never exposed in the browser — it is only returned from the server after verification.
          </p>
        </div>
      </main>
      <Footer />
    </div>
  );
}
