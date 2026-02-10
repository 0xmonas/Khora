'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/providers/theme-provider';
import { base, baseSepolia } from 'wagmi/chains';

function WalletButton() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ConnectButton, setConnectButton] = useState<any>(null);

  useEffect(() => {
    import('@rainbow-me/rainbowkit').then((mod) => {
      setConnectButton(() => mod.ConnectButton);
    });
  }, []);

  if (!ConnectButton) {
    return (
      <button
        className="h-10 sm:h-12 px-4 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 font-mono text-sm dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors"
      >
        Connect
      </button>
    );
  }

  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }: {
        account?: { displayName: string };
        chain?: { id: number; unsupported?: boolean; name?: string };
        openAccountModal: () => void;
        openChainModal: () => void;
        openConnectModal: () => void;
        mounted: boolean;
      }) => {
        const connected = mounted && account && chain;

        if (!connected) {
          return (
            <button
              onClick={openConnectModal}
              className="h-10 sm:h-12 px-4 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 font-mono text-sm dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors"
            >
              Connect
            </button>
          );
        }

        const isBase = chain.id === base.id;
        const isBaseSepolia = chain.id === baseSepolia.id;
        const isSupported = isBase || isBaseSepolia;

        const dotColor = isBase
          ? 'bg-green-500'
          : isBaseSepolia
            ? 'bg-yellow-500'
            : 'bg-red-500';

        const chainLabel = isBase
          ? 'Base'
          : isBaseSepolia
            ? 'Sepolia'
            : 'Wrong Network';

        return (
          <div className="flex items-center gap-2">
            {/* Network Switcher */}
            <button
              onClick={openChainModal}
              className={`h-10 sm:h-12 px-3 border-2 font-mono text-xs flex items-center gap-2 transition-colors ${
                isSupported
                  ? 'border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5'
                  : 'border-red-500 bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${dotColor}`} />
              {chainLabel}
            </button>

            {/* Account Button */}
            <button
              onClick={openAccountModal}
              className="h-10 sm:h-12 px-4 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 font-mono text-sm dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors"
            >
              {account.displayName}
            </button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}

export function Header() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  return (
    <div className="p-4 md:p-8 lg:p-12 bg-background">
      <div className="w-full lg:grid lg:grid-cols-12">
        <div className="hidden lg:block lg:col-span-1" />
        <div className="lg:col-span-10">
          <div className="flex items-center justify-between">
            <div
              style={{ width: '48px', height: '48px', position: 'relative' }}
              onClick={() => router.replace('/')}
              className="cursor-pointer"
            >
              <Image
                src="/logo.png"
                alt="Logo"
                fill
                sizes="48px"
                loading="eager"
                className="object-contain bg-[#30f] dark:bg-background"
              />
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="h-10 sm:h-12 px-4 text-neutral-500 hover:text-black dark:hover:text-white transition-colors w-fit"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              </button>
              <WalletButton />
            </div>
          </div>
        </div>
        <div className="hidden lg:block lg:col-span-1" />
      </div>
    </div>
  );
}
