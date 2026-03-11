'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';

function ScanlineOverlay() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-10 opacity-[0.03]"
      style={{
        backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, currentColor 2px, currentColor 3px)',
      }}
    />
  );
}

function HexDump({ error }: { error: string }) {
  const lines = [];
  const bytes = new TextEncoder().encode(error.slice(0, 96));

  for (let i = 0; i < bytes.length; i += 8) {
    const hex = Array.from(bytes.slice(i, i + 8))
      .map(b => b.toString(16).padStart(2, '0'))
      .join(' ');
    const ascii = Array.from(bytes.slice(i, i + 8))
      .map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.')
      .join('');
    lines.push(
      <div key={i} className="flex gap-4">
        <span className="text-neutral-500">{i.toString(16).padStart(4, '0')}</span>
        <span className="text-red-400 dark:text-red-500">{hex.padEnd(23)}</span>
        <span className="text-neutral-400">{ascii}</span>
      </div>
    );
  }

  return <div className="font-mono text-[10px] leading-relaxed">{lines}</div>;
}

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [time, setTime] = useState('');

  useEffect(() => {
    setTime(new Date().toISOString().replace('T', ' ').slice(0, 19));
    console.error('[KHORA ERROR]', error);
  }, [error]);

  return (
    <div className="min-h-screen flex flex-col bg-background relative">
      <ScanlineOverlay />
      <Header />
      <main className="flex-1 flex items-center justify-center px-4 relative z-20">
        <div className="max-w-lg w-full space-y-6">
          <div className="border-2 border-red-500/40 dark:border-red-400/40 bg-red-500/[0.02] dark:bg-red-400/[0.02] p-6 space-y-5">
            {/* Header */}
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="font-mono text-[9px] uppercase tracking-widest text-red-500 dark:text-red-400">
                  RUNTIME EXCEPTION
                </div>
                <h1 className="font-mono text-2xl font-bold text-neutral-900 dark:text-white">
                  System Fault
                </h1>
              </div>
              <div className="font-mono text-[9px] text-neutral-400 text-right space-y-0.5">
                <div>{time}</div>
                {error.digest && <div>digest: {error.digest}</div>}
              </div>
            </div>

            {/* Error message */}
            <div className="border border-neutral-300 dark:border-neutral-700 p-3 space-y-2">
              <div className="font-mono text-[9px] uppercase tracking-wider text-neutral-400">
                Error Message
              </div>
              <p className="font-mono text-xs text-neutral-700 dark:text-neutral-300 break-all">
                {error.message || 'An unexpected error occurred'}
              </p>
            </div>

            {/* Hex dump */}
            <div className="border border-neutral-300 dark:border-neutral-700 p-3 space-y-2">
              <div className="font-mono text-[9px] uppercase tracking-wider text-neutral-400">
                Memory Dump
              </div>
              <HexDump error={error.message || 'unknown error'} />
            </div>

            {/* Status indicators */}
            <div className="flex gap-6 font-mono text-[10px]">
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                <span className="text-neutral-500">FAULT</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-yellow-500 rounded-full" />
                <span className="text-neutral-500">RECOVERABLE</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={reset}
              className="flex-1 h-10 border-2 border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900 font-mono text-xs hover:bg-neutral-600 dark:hover:bg-neutral-300 transition-colors"
            >
              RETRY
            </button>
            <Link
              href="/"
              className="flex-1 h-10 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 text-neutral-700 dark:text-neutral-200 font-mono text-xs flex items-center justify-center hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors"
            >
              RETURN HOME
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
