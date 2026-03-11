'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from '@/components/providers/theme-provider';
import { shape, shapeSepolia } from 'wagmi/chains';

const walletFont = { fontFamily: 'var(--font-departure-mono)' };

/** Inner component that receives RainbowKit render props — hooks are safe here */
function WalletButtonInner({ account, chain, openAccountModal, openChainModal, openConnectModal, authenticationStatus, mounted }: {
  account?: { displayName: string };
  chain?: { id: number; unsupported?: boolean; name?: string };
  openAccountModal: () => void;
  openChainModal: () => void;
  openConnectModal: () => void;
  authenticationStatus?: string;
  mounted: boolean;
}) {
  const connected = mounted && account && chain;
  const needsAuth = connected && (authenticationStatus === 'unauthenticated');

  if (!connected) {
    return (
      <button
        onClick={openConnectModal}
        className="h-10 sm:h-12 px-4 bg-transparent text-sm text-foreground hover:opacity-70 transition-opacity"
        style={walletFont}
      >
        Connect
      </button>
    );
  }

  // RainbowKit disables openChainModal/openAccountModal when SIWE auth is
  // not 'authenticated' (they become noop). Fall back to openConnectModal
  // which triggers the SIWE sign-in flow.
  const handleChainClick = needsAuth ? openConnectModal : openChainModal;
  const handleAccountClick = needsAuth ? openConnectModal : openAccountModal;

  const isShape = chain.id === shape.id;
  const isShapeSepolia = chain.id === shapeSepolia.id;
  const isSupported = isShape || isShapeSepolia;

  const dotColor = isShape
    ? 'bg-green-500'
    : isShapeSepolia
      ? 'bg-yellow-500'
      : 'bg-red-500';

  const chainLabel = isShape
    ? 'Shape'
    : isShapeSepolia
      ? 'Sepolia'
      : 'Wrong Network';

  return (
    <div className="flex items-center gap-2">
      {/* Network Switcher */}
      <button
        onClick={handleChainClick}
        style={walletFont}
        className={`h-10 sm:h-12 px-3 text-xs flex items-center gap-2 transition-opacity ${
          isSupported
            ? 'bg-transparent text-foreground hover:opacity-70'
            : 'bg-transparent text-red-600 dark:text-red-400 hover:opacity-70'
        }`}
      >
        <span className={`w-2 h-2 rounded-full ${dotColor}`} />
        {chainLabel}
      </button>

      {/* Account Button */}
      <button
        onClick={handleAccountClick}
        className="h-10 sm:h-12 px-4 bg-transparent text-sm text-foreground hover:opacity-70 transition-opacity"
        style={walletFont}
      >
        {account.displayName}
      </button>
    </div>
  );
}

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
        className="h-10 sm:h-12 px-4 bg-transparent text-sm text-foreground hover:opacity-70 transition-opacity"
        style={walletFont}
      >
        Connect
      </button>
    );
  }

  return (
    <ConnectButton.Custom>
      {(props: Parameters<typeof WalletButtonInner>[0]) => <WalletButtonInner {...props} />}
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
          <div className="flex items-center justify-between relative">
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
            <nav className="hidden md:flex items-center justify-center gap-6 absolute left-1/2 -translate-x-1/2">
              <Link href="/booa" className="text-sm text-muted-foreground hover:text-foreground transition-colors" style={walletFont}>
                BOOA
              </Link>
              <Link href="/bridge" className="text-sm text-muted-foreground hover:text-foreground transition-colors" style={walletFont}>
                Bridge
              </Link>
              <Link href="/agents" className="text-sm text-muted-foreground hover:text-foreground transition-colors" style={walletFont}>
                Ident Cards
              </Link>
            </nav>
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
