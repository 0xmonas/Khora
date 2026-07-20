'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useAccount } from 'wagmi';
import { Gallery } from './components';
import { ConnectPrompt } from './components/ConnectPrompt';

const font = { fontFamily: 'var(--font-departure-mono)' };

export function CollectionPage() {
  const { isConnected } = useAccount();

  return (
    <div className="bg-background p-4 md:p-8 lg:p-12">
      <div className="w-full lg:grid lg:grid-cols-12">
        <div className="hidden lg:block lg:col-span-1" />
        <div className="lg:col-span-10">

          <div className="space-y-3 mb-6">
            <Link href="/booa" className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors" style={font}>
              <ArrowLeft className="w-3 h-3" /> BOOA
            </Link>
            <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>Collection</h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-lg" style={font}>
              Every BOOA agent, fully on-chain. Browse the collection, search by id or name, and open any agent to view its art, traits, and ERC-8004 identity.
            </p>
          </div>

          {isConnected ? (
            <div className="w-full">
              <Gallery />
            </div>
          ) : (
            <ConnectPrompt />
          )}
        </div>
        <div className="hidden lg:block lg:col-span-1" />
      </div>
    </div>
  );
}
