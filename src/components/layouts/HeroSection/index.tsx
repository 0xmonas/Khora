'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Github, ArrowRight } from 'lucide-react';
import { ShaderLogo } from '@/components/ui/ShaderLogo';

const font = { fontFamily: 'var(--font-departure-mono)' };
const micro = 'text-[9px] uppercase tracking-[0.2em]';

/* ═══════════════════════════════════════
   DATA — reflects the full BOOA ecosystem
   ═══════════════════════════════════════ */

const SUPPORTED_CHAINS = [
  { name: 'Ethereum', chainId: 1, logo: '/chains/ethereum.png' },
  { name: 'Base', chainId: 8453, logo: '/chains/base.png' },
  { name: 'Shape', chainId: 360, logo: '/chains/shape.png' },
  { name: 'Polygon', chainId: 137, logo: '/chains/polygon.png' },
  { name: 'Arbitrum', chainId: 42161, logo: '/chains/arbitrum.png' },
  { name: 'OP Mainnet', chainId: 10, logo: '/chains/optimism.png' },
  { name: 'Avalanche', chainId: 43114, logo: '/chains/avalanche.png' },
  { name: 'BNB Chain', chainId: 56, logo: '/chains/bnb.png' },
  { name: 'Celo', chainId: 42220, logo: '/chains/celo.png' },
  { name: 'Gnosis', chainId: 100, logo: '/chains/gnosis.png' },
  { name: 'Scroll', chainId: 534352, logo: '/chains/scroll.png' },
  { name: 'Linea', chainId: 59144, logo: '/chains/linea.png' },
  { name: 'Mantle', chainId: 5000, logo: '/chains/mantle.png' },
  { name: 'Metis', chainId: 1088, logo: '/chains/metis.png' },
  { name: 'Abstract', chainId: 2741, logo: '/chains/abstract.png' },
  { name: 'Monad', chainId: 143, logo: '/chains/monad.png' },
];

function LiveStats() {
  const [stats, setStats] = useState<{ booaMinted: number; agentsRegistered: number; chainsSupported: number } | null>(null);
  const [selectedChain, setSelectedChain] = useState<number | null>(null);

  useEffect(() => {
    const url = selectedChain ? `/api/stats?chainId=${selectedChain}` : '/api/stats';
    fetch(url)
      .then(r => r.json())
      .then(setStats)
      .catch(() => {});
  }, [selectedChain]);

  const selectedName = selectedChain
    ? SUPPORTED_CHAINS.find(c => c.chainId === selectedChain)?.name
    : null;

  const items = [
    { label: 'BOOA Minted', value: stats?.booaMinted ?? '—' },
    {
      label: 'Agents Registered',
      value: stats?.agentsRegistered ?? '—',
      sub: selectedName ? `on ${selectedName}` : 'via BOOA',
    },
    { label: 'Chains Supported', value: stats?.chainsSupported ?? '—' },
  ];

  return (
    <div className="px-4 md:px-8 lg:px-12 mt-20 md:mt-24">
      <div className="w-full lg:grid lg:grid-cols-12">
        <div className="hidden lg:block lg:col-span-1" />
        <div className="lg:col-span-10 space-y-6">
          <p className={`${micro} text-muted-foreground/50`} style={font}>Live</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-neutral-200 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-800">
            {items.map((item) => (
              <div key={item.label} className="bg-background p-6 flex flex-col gap-1">
                <span className="text-2xl sm:text-3xl text-foreground tabular-nums" style={font}>
                  {typeof item.value === 'number' ? item.value.toLocaleString() : item.value}
                </span>
                <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider" style={font}>
                  {item.label}
                </span>
                {item.sub && (
                  <span className="text-[9px] text-muted-foreground/30 uppercase" style={font}>{item.sub}</span>
                )}
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {SUPPORTED_CHAINS.map((chain) => {
              const isActive = selectedChain === chain.chainId;
              return (
                <button
                  key={chain.name}
                  onClick={() => setSelectedChain(isActive ? null : chain.chainId)}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 border text-[10px] transition-colors ${
                    isActive
                      ? 'border-foreground text-foreground bg-foreground/5'
                      : 'border-neutral-200 dark:border-neutral-800 text-muted-foreground/60 hover:border-neutral-400 dark:hover:border-neutral-600'
                  }`}
                  style={font}
                >
                  <Image src={chain.logo} alt={chain.name} width={14} height={14} className="w-3.5 h-3.5 rounded-full" />
                  {chain.name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="hidden lg:block lg:col-span-1" />
      </div>
    </div>
  );
}

const PRODUCTS = [
  {
    name: 'BOOA',
    tagline: 'Born On-chain Owned Agents',
    desc: 'Fully on-chain AI character NFTs on Shape. AI generates unique pixel art portraits, personalities, and skills — stored permanently via SSTORE2.',
    href: '/booa',
    cta: 'Explore BOOA',
  },
  {
    name: 'Bridge',
    tagline: 'NFT to Agent Converter',
    desc: 'Turn any existing NFT into an on-chain agent. Connect your wallet, select an NFT from any chain, configure its identity, and register it.',
    href: '/bridge',
    cta: 'Open Bridge',
  },
];

const CAPABILITIES = [
  { label: 'Agents', desc: 'Create, register, and discover autonomous AI agents with verifiable on-chain identities.' },
  { label: 'NFTs', desc: 'Mint fully on-chain generative NFTs or bridge existing collections into the agent ecosystem.' },
  { label: 'Tools', desc: 'Open-source developer tools for building agent-native applications and protocols.' },
  { label: 'Games', desc: 'Coming soon.' },
];



export function HeroSection() {
  return (
    <div className="flex-1 flex flex-col">

      {/* Hero Video — ASCII shader */}
      <div className="px-4 md:px-6 lg:px-8 py-16 md:py-24 lg:py-32">
        <div className="w-full max-w-[1400px] mx-auto aspect-[5/2] relative">
          <ShaderLogo src="/tree.mp4" type="video" />
        </div>
      </div>

      {/* ══════════════════════════════════════
          TAGLINE
         ══════════════════════════════════════ */}
      <div className="px-4 md:px-8 lg:px-12 mt-20 md:mt-28">
        <div className="w-full lg:grid lg:grid-cols-12">
          <div className="hidden lg:block lg:col-span-1" />
          <div className="lg:col-span-10 flex flex-col items-center">
            <p className="text-lg sm:text-xl text-foreground max-w-3xl text-center leading-relaxed" style={font}>
              Open-source studio building tools for autonomous agents,
              generative NFTs, on-chain games, and decentralized infrastructure.
            </p>
            <p className="text-sm text-muted-foreground/60 max-w-xl text-center mt-4" style={font}>
              Everything we build is fully open source.
            </p>
          </div>
          <div className="hidden lg:block lg:col-span-1" />
        </div>
      </div>

      {/* ══════════════════════════════════════
          CAPABILITIES — 4-column grid
         ══════════════════════════════════════ */}
      <div className="px-4 md:px-8 lg:px-12 mt-20 md:mt-24">
        <div className="w-full lg:grid lg:grid-cols-12">
          <div className="hidden lg:block lg:col-span-1" />
          <div className="lg:col-span-10">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border border-neutral-200 dark:border-neutral-800">
              {CAPABILITIES.map((cap, i) => (
                <div
                  key={cap.label}
                  className={`p-5 md:p-6 ${
                    i > 0 ? 'border-t sm:border-t-0 sm:border-l border-neutral-200 dark:border-neutral-800' : ''
                  } ${i >= 2 ? 'lg:border-t-0 sm:border-t border-neutral-200 dark:border-neutral-800' : ''}`}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[9px] text-muted-foreground/30 tabular-nums" style={font}>
                      {String(i + 1).padStart(2, '0')}
                    </span>
                    <span className="text-sm text-foreground" style={font}>{cap.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground/70 leading-relaxed" style={font}>
                    {cap.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="hidden lg:block lg:col-span-1" />
        </div>
      </div>

      {/* ══════════════════════════════════════
          LIVE STATS
         ══════════════════════════════════════ */}
      <LiveStats />

      {/* ══════════════════════════════════════
          PRODUCTS
         ══════════════════════════════════════ */}
      <div className="px-4 md:px-8 lg:px-12 mt-20 md:mt-24">
        <div className="w-full lg:grid lg:grid-cols-12">
          <div className="hidden lg:block lg:col-span-1" />
          <div className="lg:col-span-10">

            <p className={`${micro} text-muted-foreground/50 mb-6`} style={font}>Products</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-neutral-200 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-800">
              {PRODUCTS.map((product) => (
                <Link
                  key={product.name}
                  href={product.href}
                  className="group bg-background p-6 space-y-3 hover:bg-neutral-50 dark:hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base text-foreground" style={font}>
                        {product.name}
                      </h3>
                      <p className="text-[10px] text-muted-foreground/50 uppercase mt-0.5" style={font}>
                        {product.tagline}
                      </p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted-foreground/20 group-hover:text-foreground transition-colors" />
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed" style={font}>
                    {product.desc}
                  </p>
                  <span
                    className="inline-block text-[11px] text-foreground border-b border-foreground/30 group-hover:border-foreground transition-colors"
                    style={font}
                  >
                    {product.cta} &rarr;
                  </span>
                </Link>
              ))}
            </div>

          </div>
          <div className="hidden lg:block lg:col-span-1" />
        </div>
      </div>

      {/* ══════════════════════════════════════
          ABOUT + DETAILS
         ══════════════════════════════════════ */}
      <div className="px-4 md:px-8 lg:px-12 mt-20 md:mt-24">
        <div className="w-full lg:grid lg:grid-cols-12">
          <div className="hidden lg:block lg:col-span-1" />
          <div className="lg:col-span-10">

            <div className="max-w-2xl space-y-16">

              {/* About */}
              <div className="space-y-4">
                <p className={`${micro} text-muted-foreground/50`} style={font}>About</p>
                <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                  BOOA is an open-source studio building infrastructure for autonomous agents,
                  generative NFTs, developer tools, and game systems. We believe the next wave of
                  internet applications will be built by and for autonomous software, and the
                  infrastructure powering them should be open, verifiable, and composable.
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                  Our tools let you create agents from scratch, mint generative NFTs,
                  bridge existing collections into the agent ecosystem, and build
                  games where agents interact autonomously. Everything we build is fully open source.
                </p>
              </div>

              {/* ERC-8004 */}
              <div className="space-y-4">
                <p className={`${micro} text-muted-foreground/50`} style={font}>ERC-8004</p>
                <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                  ERC-8004 is an on-chain identity registry standard. It stores an agent&apos;s
                  name, description, services, skills, domains, and metadata as a data URI directly
                  on-chain. Any protocol, marketplace, or application can read this identity without
                  trusting a centralized server.
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                  The Identity Registry is deployed on 16 chains at the same address via
                  deterministic CREATE2. Agents can register on any chain, and BOOA discovers
                  them all in parallel.
                </p>
              </div>

              {/* Open source */}
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Github className="w-4 h-4 text-muted-foreground/50" />
                  <p className={`${micro} text-muted-foreground/50`} style={font}>Open source</p>
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                  Smart contracts, frontend, AI pipeline, developer tools — everything is public.
                  Fork it, extend it, or build on top of it.
                </p>
                <a
                  href="https://github.com/0xmonas/Khora"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-block text-sm text-foreground border-b border-foreground hover:opacity-70 transition-opacity"
                  style={font}
                >
                  github.com/0xmonas/Khora
                </a>
              </div>

            </div>

          </div>
          <div className="hidden lg:block lg:col-span-1" />
        </div>
      </div>

      {/* Bottom spacer */}
      <div className="h-12 md:h-16" />

    </div>
  );
}
