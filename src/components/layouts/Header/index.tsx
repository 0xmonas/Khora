'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/providers/theme-provider';

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
      {({ account, chain, openAccountModal, openConnectModal, mounted }: {
        account?: { displayName: string };
        chain?: { id: number };
        openAccountModal: () => void;
        openConnectModal: () => void;
        mounted: boolean;
      }) => {
        const connected = mounted && account && chain;
        return (
          <button
            onClick={connected ? openAccountModal : openConnectModal}
            className="h-10 sm:h-12 px-4 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 font-mono text-sm dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors"
          >
            {connected ? account.displayName : 'Connect'}
          </button>
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
              <WalletButton />
              <button
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="h-10 sm:h-12 px-4 text-neutral-500 hover:text-black dark:hover:text-white transition-colors w-fit"
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
              </button>
            </div>
          </div>
        </div>
        <div className="hidden lg:block lg:col-span-1" />
      </div>
    </div>
  );
}
