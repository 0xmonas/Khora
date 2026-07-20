'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useAccount } from 'wagmi';
import { ConnectPrompt } from '@/components/features/generator/components/ConnectPrompt';
import { useBridge } from './BridgeContext';
import { NFTGrid } from './components/NFTGrid';
import { ConfigPanel } from './components/ConfigPanel';
import { SelectedNFTPreview } from './components/SelectedNFTPreview';
import { RegisterModal } from './components/RegisterModal';

const font = { fontFamily: 'var(--font-departure-mono)' };

export default function BridgePage() {
  const { isConnected } = useAccount();
  const { selectedNFT } = useBridge();

  return (
    <div className="bg-background p-4 md:p-8 lg:p-12">
      <div className="w-full lg:grid lg:grid-cols-12">
        <div className="hidden lg:block lg:col-span-1" />
        <div className="lg:col-span-10">
          {/* Page Title */}
          <div className="space-y-3 mb-6">
            <Link href="/studio" className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors" style={font}>
              <ArrowLeft className="w-3 h-3" /> Studio
            </Link>
            <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>Bridge</h1>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-lg" style={font}>
              Turn any NFT into an ERC-8004 registered agent. Pick an NFT, set its identity, and bind it onchain. Register across supported chains; your original Shape works stay visible here.
            </p>
          </div>

          {isConnected ? (
            <>
              {selectedNFT ? (
                /* NFT selected: left ConfigPanel + right Preview (like /mint layout) */
                <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
                  <ConfigPanel />
                  <div className="flex-1">
                    <SelectedNFTPreview />
                  </div>
                </div>
              ) : (
                /* No selection: full-width NFT grid + BOOA agents */
                <NFTGrid />
              )}
              <RegisterModal />
            </>
          ) : (
            <ConnectPrompt />
          )}
        </div>
        <div className="hidden lg:block lg:col-span-1" />
      </div>
    </div>
  );
}
