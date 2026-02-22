'use client';

import { useAccount } from 'wagmi';
import { ConnectPrompt } from '@/components/features/generator/components/ConnectPrompt';
import { useBridge } from './BridgeContext';
import { NFTGrid } from './components/NFTGrid';
import { ConfigPanel } from './components/ConfigPanel';
import { SelectedNFTPreview } from './components/SelectedNFTPreview';
import { RegisterModal } from './components/RegisterModal';

export default function BridgePage() {
  const { isConnected } = useAccount();
  const { selectedNFT } = useBridge();

  return (
    <div className="bg-background p-4 md:p-8 lg:p-12">
      <div className="w-full lg:grid lg:grid-cols-12">
        <div className="hidden lg:block lg:col-span-1" />
        <div className="lg:col-span-10">
          {/* Page Title */}
          <div className="mb-8">
            <h1 className="font-mono text-lg dark:text-white">NFT to Agent Bridge</h1>
            <p className="font-mono text-xs text-neutral-500 mt-1">
              Convert any NFT into an ERC-8004 registered agent on the Identity Protocol
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
