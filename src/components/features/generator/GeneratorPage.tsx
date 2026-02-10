'use client';

import { useAccount } from 'wagmi';
import { InputForm, OutputSection, Gallery, MintFlowModal } from './components';
import { ConnectPrompt } from './components/ConnectPrompt';

export default function GeneratorPage() {
  const { isConnected } = useAccount();

  return (
    <div className="bg-background p-4 md:p-8 lg:p-12">
      <div className="w-full lg:grid lg:grid-cols-12">
        <div className="hidden lg:block lg:col-span-1" />
        <div className="lg:col-span-10">
          {isConnected ? (
            <>
              <div className="flex flex-col lg:flex-row gap-8 lg:gap-12">
                <div className="w-full lg:w-[280px] flex-shrink-0">
                  <InputForm />
                </div>
                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-8">
                  <OutputSection />
                  <Gallery />
                </div>
              </div>
              <MintFlowModal />
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
