'use client';

import { useState, useEffect, useCallback } from 'react';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { isAllowlisted } from '@/lib/allowlist';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';

const font = { fontFamily: 'var(--font-departure-mono)' };
const SHAPE_CHAIN_ID = 360;

export default function AllowlistCheckerPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const [checking, setChecking] = useState(false);
  const [eligible, setEligible] = useState<boolean | null>(null);
  const [addingChain, setAddingChain] = useState(false);

  const hasShape = chainId === SHAPE_CHAIN_ID;

  const checkAllowlist = useCallback(async () => {
    if (!address) return;
    setChecking(true);
    try {
      const result = await isAllowlisted(address);
      setEligible(result);
    } catch {
      setEligible(null);
    } finally {
      setChecking(false);
    }
  }, [address]);

  useEffect(() => {
    if (address && hasShape) {
      checkAllowlist();
    } else {
      setEligible(null);
    }
  }, [address, hasShape, checkAllowlist]);

  const handleAddShape = async () => {
    setAddingChain(true);
    try {
      switchChain({ chainId: SHAPE_CHAIN_ID });
    } catch {
      // User rejected or chain not configured
    } finally {
      setAddingChain(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />

      <main className="flex-1 flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-md space-y-6">
          {/* Title */}
          <div className="space-y-2 text-center">
            <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest" style={font}>
              BOOA
            </p>
            <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>
              Allowlist Checker
            </h1>
            <p className="text-xs text-muted-foreground leading-relaxed" style={font}>
              Check if your wallet is on the mint allowlist.
            </p>
          </div>

          {/* Main Card */}
          <div className="border-2 border-neutral-700 dark:border-neutral-200 p-6 space-y-4">

            {/* Step 1: Connect wallet */}
            {!isConnected ? (
              <div className="space-y-3 text-center">
                <StepLabel n={1} text="Connect your wallet" />
                <div className="flex justify-center">
                  <ConnectButton />
                </div>
              </div>

            /* Step 2: Add Shape Network */
            ) : !hasShape ? (
              <div className="space-y-3 text-center">
                <StepLabel n={1} text="Add Shape Network" />
                <p className="text-[10px] text-muted-foreground/60" style={font}>
                  Shape Network (Chain ID: 360) is required.
                </p>
                <button
                  onClick={handleAddShape}
                  disabled={addingChain}
                  className="w-full h-10 border-2 border-neutral-700 dark:border-neutral-200 text-sm text-foreground hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-colors disabled:opacity-40"
                  style={font}
                >
                  {addingChain ? 'Confirm in wallet...' : 'Add Shape to Wallet'}
                </button>
              </div>

            /* Checking */
            ) : checking ? (
              <div className="space-y-3 text-center">
                <p className="text-xs text-muted-foreground" style={font}>
                  Checking...
                </p>
                <p className="text-[10px] text-muted-foreground/60" style={font}>
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </p>
              </div>

            /* Eligible */
            ) : eligible === true ? (
              <div className="space-y-3 text-center">
                <div className="text-3xl">&#10003;</div>
                <p className="text-sm text-green-600 dark:text-green-500" style={font}>
                  You&apos;re on the allowlist
                </p>
                <p className="text-[10px] text-muted-foreground" style={font}>
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </p>
                <p className="text-[10px] text-muted-foreground/60" style={font}>
                  You will be able to mint when the allowlist phase begins.
                </p>
              </div>

            /* Not eligible */
            ) : eligible === false ? (
              <div className="space-y-3 text-center">
                <div className="text-3xl">&#10007;</div>
                <p className="text-sm text-red-500" style={font}>
                  Not on the allowlist
                </p>
                <p className="text-[10px] text-muted-foreground" style={font}>
                  {address?.slice(0, 6)}...{address?.slice(-4)}
                </p>
                <p className="text-[10px] text-muted-foreground/60" style={font}>
                  Public mint will be available after the allowlist phase.
                </p>
              </div>

            /* Error / null state */
            ) : (
              <div className="space-y-3 text-center">
                <p className="text-xs text-muted-foreground" style={font}>
                  Could not check allowlist. Please try again.
                </p>
                <button
                  onClick={checkAllowlist}
                  className="w-full h-10 border-2 border-neutral-700 dark:border-neutral-200 text-sm text-foreground hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-colors"
                  style={font}
                >
                  Retry
                </button>
              </div>
            )}
          </div>

          {/* Footer info */}
          <div className="space-y-1 text-center">
            <p className="text-[10px] text-muted-foreground/40" style={font}>
              No gas required to check.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function StepLabel({ n, text }: { n: number; text: string }) {
  return (
    <div className="flex items-center justify-center gap-2">
      <span
        className="w-5 h-5 flex items-center justify-center border border-muted-foreground/30 text-[9px] text-muted-foreground"
        style={font}
      >
        {n}
      </span>
      <p className="text-xs text-muted-foreground" style={font}>
        {text}
      </p>
    </div>
  );
}
