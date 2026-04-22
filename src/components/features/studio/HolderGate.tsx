'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ConnectPrompt } from '@/components/features/generator/components/ConnectPrompt';
import { useHolderAuth } from '@/hooks/useAuth';

const font = { fontFamily: 'var(--font-departure-mono)' };

function SignInPrompt() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ConnectButton, setConnectButton] = useState<any>(null);
  useEffect(() => {
    import('@rainbow-me/rainbowkit').then((mod) => setConnectButton(() => mod.ConnectButton));
  }, []);
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-6">
      <p className="text-sm text-muted-foreground max-w-md" style={font}>
        Sign in with your wallet to verify you&apos;re the address we&apos;re seeing.
      </p>
      {ConnectButton && <ConnectButton />}
    </div>
  );
}

function CenteredMessage({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
      <p className="text-xs text-muted-foreground uppercase tracking-[0.15em]" style={font}>
        {label}
      </p>
      {children}
    </div>
  );
}

export function HolderGate({
  children,
  minBalance = 1,
  toolName,
}: {
  children: React.ReactNode;
  minBalance?: number;
  toolName?: string;
}) {
  const safeMin = Math.max(1, Math.floor(Number.isFinite(minBalance) ? minBalance : 1));
  const {
    isConnected,
    isAuthenticated,
    walletStatus,
    isHolder,
    holdingCount,
    balanceLoading,
    balanceError,
    refetchBalance,
  } = useHolderAuth(safeMin);

  if (walletStatus === 'connecting' || walletStatus === 'reconnecting') {
    return <CenteredMessage label="Checking wallet..." />;
  }

  if (!isConnected) {
    return <ConnectPrompt />;
  }

  if (!isAuthenticated) {
    return <SignInPrompt />;
  }

  if (balanceLoading) {
    return <CenteredMessage label="Checking wallet..." />;
  }

  if (balanceError) {
    return (
      <CenteredMessage label="Balance check failed">
        <p className="text-sm text-muted-foreground max-w-md text-center" style={font}>
          We couldn&apos;t read your BOOA balance. Shape RPC may be rate-limited.
        </p>
        <button
          onClick={() => refetchBalance()}
          className="mt-2 border-2 border-neutral-700 dark:border-neutral-200 px-4 py-2 text-xs uppercase hover:bg-foreground/5 transition-colors"
          style={font}
        >
          Retry
        </button>
      </CenteredMessage>
    );
  }

  if (!isHolder) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-6">
        <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest" style={font}>
          Holder only
        </p>
        <h2 className="text-2xl text-foreground" style={font}>
          {toolName ? `${toolName} is for BOOA holders` : 'BOOA holders only'}
        </h2>
        <p className="text-sm text-muted-foreground max-w-md" style={font}>
          {safeMin > 1
            ? `Hold at least ${safeMin} BOOA to unlock this tool.`
            : 'Hold at least one BOOA to unlock this tool.'}
          {' '}You currently hold {holdingCount}.
        </p>
        <Link
          href="/gallery"
          className="mt-2 text-xs text-muted-foreground underline hover:text-foreground transition-colors"
          style={font}
        >
          Browse BOOA
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
