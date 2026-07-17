'use client';

import { useAccount } from 'wagmi';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { ConnectPrompt } from '@/components/features/generator/components/ConnectPrompt';
import { MigrateProvider } from '@/components/features/migrate/MigrateContext';
import { TokenGrid } from '@/components/features/migrate/TokenGrid';
import { MigratePanel } from '@/components/features/migrate/MigratePanel';

const font = { fontFamily: 'var(--font-departure-mono)' };

export default function MigratePage() {
  const { isConnected } = useAccount();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="p-4 md:p-8 lg:p-12">
          <div className="w-full lg:grid lg:grid-cols-12">
            <div className="hidden lg:block lg:col-span-1" />
            <div className="lg:col-span-10 space-y-6">

              <div className="space-y-3">
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest" style={font}>
                  Shape → Ethereum
                </p>
                <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>
                  Migrate your BOOA
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-xl" style={font}>
                  Move your BOOA from Shape to Ethereum mainnet. Pick the tokens you want,
                  burn them on Shape, and claim the exact same IDs on Ethereum. Fully on-chain,
                  1:1, same art. Do it in one batch or a few at a time — you choose.
                </p>
              </div>

              {!isConnected ? (
                <ConnectPrompt />
              ) : (
                <MigrateProvider>
                  <div className="flex flex-col lg:flex-row gap-4">
                    <div className="flex-1 border-2 border-neutral-700 dark:border-neutral-200 p-4 min-h-[300px]">
                      <TokenGrid />
                    </div>
                    <div className="w-full lg:w-72 shrink-0">
                      <MigratePanel />
                    </div>
                  </div>
                </MigrateProvider>
              )}

            </div>
            <div className="hidden lg:block lg:col-span-1" />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
