'use client';

import { useAccount } from 'wagmi';
import { InputForm, OutputSection } from './components';
import { ConnectPrompt } from './components/ConnectPrompt';

export default function GeneratorPage() {
  const { isConnected } = useAccount();

  return (
    <div className="bg-background p-4 sm:p-8 lg:p-12">
      <div className="grid grid-cols-12">
        <div className="col-span-0 sm:col-span-1" />
        <div className="col-span-12 sm:col-span-10">
          {isConnected ? (
            <div className="flex flex-col lg:items-start lg:flex-row gap-8 lg:gap-16">
              <div className="w-full lg:w-[300px]">
                <InputForm />
              </div>
              <div className="flex-1">
                <OutputSection />
              </div>
            </div>
          ) : (
            <ConnectPrompt />
          )}
        </div>
        <div className="col-span-0 sm:col-span-1" />
      </div>
    </div>
  );
}
