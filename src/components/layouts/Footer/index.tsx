'use client';

import Image from 'next/image';
import Link from 'next/link';

const footerFont = { fontFamily: 'var(--font-departure-mono)' };
const linkClass = 'text-sm text-neutral-500 hover:text-black dark:hover:text-white transition-colors';
const iconClass = 'text-neutral-500 hover:text-black dark:hover:text-white transition-colors';

// Monochrome social icons (currentColor — adapts to text color)
function XIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function DiscordIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M20.317 4.369A19.79 19.79 0 0 0 16.558 3.2a.077.077 0 0 0-.082.038c-.354.63-.748 1.453-1.025 2.099a18.27 18.27 0 0 0-5.487 0 12.51 12.51 0 0 0-1.04-2.099.08.08 0 0 0-.081-.038A19.74 19.74 0 0 0 5.084 4.37a.07.07 0 0 0-.032.027C1.533 9.62.61 14.74 1.064 19.795a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.029.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.105 13.1 13.1 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.126-.094.252-.192.372-.292a.074.074 0 0 1 .077-.01c3.927 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.099.246.198.373.292a.077.077 0 0 1-.006.128 12.3 12.3 0 0 1-1.873.891.077.077 0 0 0-.04.106c.36.698.772 1.362 1.225 1.994a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.847-.838-10.926-3.549-15.4a.06.06 0 0 0-.031-.028zM8.02 16.711c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.974 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function GithubIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  );
}

const NFT_CONTRACT = process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS || process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS_TESTNET || '';
const isMainnet = !!process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS;
const openseaUrl = isMainnet
  ? `https://opensea.io/assets/shape/${NFT_CONTRACT}`
  : `https://testnets.opensea.io/assets/shape-sepolia/${NFT_CONTRACT}`;

export function Footer() {
  return (
    <footer className="bg-background">
      <div className="p-4 md:p-8 lg:p-12">
        <div className="w-full lg:grid lg:grid-cols-12">
          <div className="hidden lg:block lg:col-span-1" />
          <div className="lg:col-span-10 space-y-6">

            {/* NFT Collection row */}
            {NFT_CONTRACT && (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-neutral-500" style={footerFont}>
                  BOOA NFT
                </span>
                <span className="text-xs text-neutral-400 break-all" style={footerFont}>
                  {NFT_CONTRACT}
                </span>
                <Link
                  href={openseaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Image
                    src="/opensea.png"
                    alt="OpenSea"
                    width={20}
                    height={20}
                    className="rounded-full hover:opacity-80 transition-opacity"
                  />
                </Link>
              </div>
            )}

            {/* Links row */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <p className="text-sm text-neutral-500" style={footerFont}>
                &copy; 2025 KHORA.FUN
              </p>
              <div className="flex flex-wrap items-center gap-6">
                <Link href="/terms" className={linkClass} style={footerFont}>
                  Terms
                </Link>
                <Link href="/privacy" className={linkClass} style={footerFont}>
                  Privacy
                </Link>
                <a
                  href="https://x.com/khorafun"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="X"
                  className={iconClass}
                >
                  <XIcon />
                </a>
                <a
                  href="https://discord.gg/ZkvSD5aVbR"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Discord"
                  className={iconClass}
                >
                  <DiscordIcon />
                </a>
                <a
                  href="https://github.com/0xmonas/Khora"
                  target="_blank"
                  rel="noreferrer"
                  aria-label="GitHub"
                  className={iconClass}
                >
                  <GithubIcon />
                </a>
              </div>
            </div>

          </div>
          <div className="hidden lg:block lg:col-span-1" />
        </div>
      </div>
    </footer>
  );
}
