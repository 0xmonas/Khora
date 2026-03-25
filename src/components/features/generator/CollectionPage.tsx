'use client';

import { useAccount } from 'wagmi';
import { Gallery } from './components';
import { ConnectPrompt } from './components/ConnectPrompt';

export function CollectionPage() {
  const { isConnected } = useAccount();

  return (
    <div className="bg-background p-4 md:p-8 lg:p-12">
      <div className="w-full lg:grid lg:grid-cols-12">
        <div className="hidden lg:block lg:col-span-1" />
        <div className="lg:col-span-10">
          {isConnected ? (
            <div className="w-full max-w-3xl mx-auto">
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
