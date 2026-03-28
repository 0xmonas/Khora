'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useAccount, useReadContract } from 'wagmi';
import { shape } from 'wagmi/chains';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { useSiweStatus } from '@/components/providers/siwe-provider';
import { BOOA_V2_ABI, getV2Address } from '@/lib/contracts/booa-v2';

const font = { fontFamily: 'var(--font-departure-mono)' };

const MIN_HOLDINGS = 3;

export default function InnerCirclePage() {
  const siweStatus = useSiweStatus();
  const { address, isConnected } = useAccount();
  const contractAddress = getV2Address(shape.id);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data: balance } = useReadContract({
    address: contractAddress,
    abi: BOOA_V2_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: shape.id,
    query: { enabled: !!address && contractAddress.length > 2 },
  });

  const holdingCount = balance ? Number(balance) : 0;
  const hasEnough = holdingCount >= MIN_HOLDINGS;
  const isAuth = siweStatus === 'authenticated';

  const handleJoin = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/holders-chat');
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
        return;
      } else if (res.status === 401) {
        setError('Please connect your wallet and sign in first.');
      } else if (res.status === 403) {
        setError(`You need at least ${data.required} BOOAs to join. You currently hold ${data.current}.`);
      } else if (res.status === 500) {
        setError('RPC error — could not verify your holdings. Please try again.');
      } else if (res.status === 503) {
        setError('Inner Circle is not configured yet. Please try again later.');
      } else {
        setError(`Unexpected error (${res.status}). Please try again.`);
      }
    } catch {
      setError('Network error. Please check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [loading]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="p-4 md:p-8 lg:p-12">
          <div className="w-full lg:grid lg:grid-cols-12">
            <div className="hidden lg:block lg:col-span-1" />
            <div className="lg:col-span-10">
              {/* Back + Title */}
              <div className="space-y-3 mb-8">
                <Link
                  href="/studio"
                  className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                  style={font}
                >
                  <ArrowLeft className="w-3 h-3" />
                  Studio
                </Link>
                <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>
                  Inner Circle
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-lg" style={font}>
                  Exclusive X group chat for BOOA holders. Minimum {MIN_HOLDINGS} BOOAs required to join.
                </p>
              </div>

              {/* Content */}
              <div className="max-w-md mx-auto space-y-6">
                {/* Requirements */}
                <div className="border-2 border-neutral-700 dark:border-neutral-200 p-6 space-y-4">
                  <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50" style={font}>
                    REQUIREMENTS
                  </p>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${isConnected ? 'bg-green-500' : 'bg-neutral-600'}`} />
                      <span className="text-xs text-muted-foreground" style={font}>Connect wallet</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${isAuth ? 'bg-green-500' : 'bg-neutral-600'}`} />
                      <span className="text-xs text-muted-foreground" style={font}>Sign in (SIWE)</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${hasEnough ? 'bg-green-500' : 'bg-neutral-600'}`} />
                      <span className="text-xs text-muted-foreground" style={font}>
                        Hold {MIN_HOLDINGS}+ BOOAs{isAuth && ` (you have ${holdingCount})`}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Action */}
                <button
                  onClick={handleJoin}
                  disabled={loading || !isAuth || !hasEnough}
                  className="w-full h-12 border-2 border-neutral-700 dark:border-neutral-200 bg-transparent text-sm text-foreground hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  style={font}
                >
                  {loading
                    ? 'Verifying...'
                    : !isConnected
                      ? 'Connect Wallet First'
                      : !isAuth
                        ? 'Sign In First'
                        : !hasEnough
                          ? `Need ${MIN_HOLDINGS - holdingCount} More BOOAs`
                          : 'Join Inner Circle'}
                </button>

                {error && (
                  <p className="text-xs text-red-500 dark:text-red-400" style={font}>{error}</p>
                )}

                <p className="text-[9px] text-muted-foreground/40 leading-relaxed" style={font}>
                  Your wallet balance is verified on-chain. The invite link is never exposed in the browser — it is only returned from the server after verification.
                </p>
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
