'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Moon, Sun, Menu, X } from 'lucide-react';
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

const NAV_LINKS: { href: string; label: string; highlight?: boolean }[] = [
  { href: '/booa', label: 'BOOA' },
  { href: '/bridge', label: 'Bridge' },
  { href: '/studio', label: 'Studio' },
  { href: '/waitlist', label: 'AL Checker', highlight: true },
  { href: '/blog', label: 'Blog' },
];

export function Header() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  // Lock body scroll when menu is open
  useEffect(() => {
    if (menuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  return (
    <>
      <div className="p-4 md:p-8 lg:p-12 bg-background">
        <div className="w-full lg:grid lg:grid-cols-12">
          <div className="hidden lg:block lg:col-span-1" />
          <div className="lg:col-span-10">
            <div className="flex items-center justify-between relative">
              {/* Hamburger — mobile only */}
              <button
                onClick={() => setMenuOpen(true)}
                className="md:hidden h-10 w-10 flex items-center justify-center text-foreground"
                aria-label="Open menu"
              >
                <Menu size={24} />
              </button>

              <div
                style={{ width: '48px', height: '48px', position: 'relative' }}
                onClick={() => router.replace('/')}
                className="cursor-pointer"
              >
                <Image
                  src="/khoralogo.svg"
                  alt="Logo"
                  fill
                  sizes="48px"
                  loading="eager"
                  className="object-contain dark:brightness-0 dark:invert"
                />
              </div>
              <nav className="hidden md:flex items-center justify-center gap-6 absolute left-1/2 -translate-x-1/2">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`text-sm transition-colors ${
                      link.highlight
                        ? 'text-green-600 dark:text-green-500 hover:text-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    style={walletFont}
                  >
                    {link.label}
                  </Link>
                ))}
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

      {/* Mobile slide-in menu */}
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-black/60 transition-opacity duration-300 md:hidden ${
          menuOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setMenuOpen(false)}
      />

      {/* Panel */}
      <div
        className={`fixed top-0 left-0 z-50 h-full w-[80%] max-w-xs bg-background border-r-2 border-neutral-700 dark:border-neutral-200 transition-transform duration-300 ease-out md:hidden ${
          menuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-neutral-700/30 dark:border-neutral-200/30">
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest" style={walletFont}>
            MENU
          </p>
          <button
            onClick={() => setMenuOpen(false)}
            className="h-10 w-10 flex items-center justify-center text-foreground"
            aria-label="Close menu"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex flex-col p-6 gap-6">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              onClick={() => setMenuOpen(false)}
              className={`text-lg transition-colors ${
                link.highlight
                  ? 'text-green-600 dark:text-green-500 hover:text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              style={walletFont}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
