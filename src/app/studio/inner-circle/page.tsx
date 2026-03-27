'use client';

import { useState, useCallback, useEffect } from 'react';
import { useAccount, useReadContract, useChainId } from 'wagmi';
import { shape } from 'wagmi/chains';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { useSiweStatus } from '@/components/providers/siwe-provider';
import { BOOA_V2_ABI, getV2Address } from '@/lib/contracts/booa-v2';

const font = { fontFamily: 'var(--font-departure-mono)' };
const goldBloom = { color: '#c8b439', textShadow: '0 0 8px rgba(200,180,57,0.6), 0 0 20px rgba(200,180,57,0.2)' };
const dimText = { color: '#999' };

const MIN_HOLDINGS = 3;

export default function InnerCirclePage() {
  const siweStatus = useSiweStatus();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const contractAddress = getV2Address(shape.id);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // On-chain balance check
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

  // Mobile-safe: open blank window BEFORE async fetch, then set its location
  const handleJoin = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);

    // Open window synchronously (within user gesture) to avoid popup blockers
    const newWindow = window.open('about:blank', '_blank');

    try {
      const res = await fetch('/api/holders-chat');
      const data = await res.json();
      if (res.ok && data.url) {
        if (newWindow) {
          newWindow.location.href = data.url;
        } else {
          // Fallback: popup was blocked, redirect current page
          window.location.href = data.url;
        }
      } else {
        if (newWindow) newWindow.close();
        if (res.status === 401) {
          setError('Please connect your wallet and sign in first.');
        } else if (res.status === 403) {
          setError(`You need at least ${data.required} BOOAs to join. You currently hold ${data.current}.`);
        } else {
          setError('Something went wrong. Please try again.');
        }
      }
    } catch {
      if (newWindow) newWindow.close();
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [loading]);

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
              Exclusive X group chat for BOOA holders. Minimum {MIN_HOLDINGS} BOOAs required to join.
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
                <span className={`w-2 h-2 rounded-full shrink-0 ${hasEnough ? 'bg-green-500' : 'bg-neutral-600'}`} />
                <span className="text-xs text-muted-foreground">
                  Hold {MIN_HOLDINGS}+ BOOAs{isAuth && ` (you have ${holdingCount})`}
                </span>
              </div>
            </div>
          </div>

          {/* Action */}
          <div className="space-y-3">
            <button
              onClick={handleJoin}
              disabled={loading || !isAuth || !hasEnough}
              className="w-full h-12 border-2 border-neutral-700 dark:border-neutral-200 bg-transparent text-sm text-foreground hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
