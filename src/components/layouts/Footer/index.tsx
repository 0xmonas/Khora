'use client';

import Image from 'next/image';
import Link from 'next/link';

const footerFont = { fontFamily: 'var(--font-departure-mono)' };
const linkClass = 'text-sm text-neutral-500 hover:text-black dark:hover:text-white transition-colors';

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
                <Link href="/booa" className={linkClass} style={footerFont}>
                  BOOA
                </Link>
                <Link href="/bridge" className={linkClass} style={footerFont}>
                  Bridge
                </Link>
                <Link href="/blog" className={linkClass} style={footerFont}>
                  Blog
                </Link>
                <a
                  href="https://x.com/khorafun"
                  target="_blank"
                  rel="noreferrer"
                  className={linkClass}
                  style={footerFont}
                >
                  X
                </a>
                <a
                  href="https://github.com/0xmonas/Khora"
                  target="_blank"
                  rel="noreferrer"
                  className={linkClass}
                  style={footerFont}
                >
                  GitHub
                </a>
                <Link href="/terms" className={linkClass} style={footerFont}>
                  Terms
                </Link>
                <Link href="/privacy" className={linkClass} style={footerFont}>
                  Privacy
                </Link>
              </div>
            </div>

          </div>
          <div className="hidden lg:block lg:col-span-1" />
        </div>
      </div>
    </footer>
  );
}
