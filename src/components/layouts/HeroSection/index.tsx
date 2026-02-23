import Image from 'next/image';
import Link from 'next/link';
import { Github, ArrowRight } from 'lucide-react';
import { useTheme } from '@/components/providers/theme-provider';
import { ShaderLogo } from '@/components/ui/ShaderLogo';

const font = { fontFamily: 'var(--font-departure-mono)' };

const PRODUCTS = [
  {
    name: 'BOOA',
    tagline: 'Born On-chain Owned Agents',
    desc: 'Fully on-chain AI character NFTs on Base. AI generates unique pixel art portraits, personalities, skills, and boundaries — stored permanently in the smart contract via SSTORE2.',
    href: '/booa',
    cta: 'Explore BOOA',
    features: ['AI-generated pixel art', 'On-chain bitmap storage', 'ERC-8004 registration', 'C64 palette / 2KB per agent'],
  },
  {
    name: 'Bridge',
    tagline: 'NFT to ERC-8004 Converter',
    desc: 'Turn any existing NFT into an ERC-8004 registered agent. Connect your wallet, select an NFT from any chain, configure its agent identity, and register it on the Identity Registry.',
    href: '/bridge',
    cta: 'Open Bridge',
    features: ['Multi-chain NFT scanning', 'Metadata auto-mapping', 'On-chain registration', 'Alchemy-powered indexing'],
  },
];

const PILLARS = [
  {
    title: 'On-chain identity',
    desc: 'Every agent gets a verifiable, decentralized identity via ERC-8004 — name, description, services, skills, and domains stored as a data URI directly on-chain.',
  },
  {
    title: 'Multi-chain discovery',
    desc: 'The ERC-8004 Identity Registry is deployed on 10 chains via deterministic CREATE2. Khora scans all of them in parallel to discover agents across the ecosystem.',
  },
  {
    title: 'Fully open source',
    desc: 'Smart contracts, frontend, AI pipeline — everything is public. Fork it, extend it, or build on top of it.',
  },
];

const TECH_STACK = [
  ['Identity', 'ERC-8004'],
  ['Chains', '10 chains (CREATE2)'],
  ['Taxonomy', 'OASF v0.8.0'],
  ['Protocol', 'x402 payments'],
  ['Frontend', 'Next.js + wagmi'],
  ['AI', 'Gemini + Replicate'],
];

export function HeroSection() {
  const { theme } = useTheme();

  return (
    <div className="flex-1 flex flex-col">
      <div className="p-4 md:p-8 lg:p-12">
        <div className="w-full lg:grid lg:grid-cols-12">
          <div className="hidden lg:block lg:col-span-1" />
          <div className="lg:col-span-10">

            {/* Hero */}
            <div className="flex flex-col items-center">
              <div className="w-full max-w-[1200px] mx-auto aspect-[5/2] relative">
                <Image
                  src={theme === 'dark' ? '/khoradark.png' : '/khoralogo.png'}
                  alt="Khora Logo"
                  fill
                  loading="eager"
                  sizes="(max-width: 768px) 100vw, 1200px"
                  className="object-contain invisible"
                  priority
                />
                <ShaderLogo />
              </div>
              <p
                className="text-lg sm:text-xl text-muted-foreground max-w-2xl text-center mt-12"
                style={font}
              >
                Infrastructure for AI agents that live on-chain.
              </p>
              <p
                className="text-sm text-muted-foreground/70 max-w-xl text-center mt-4"
                style={font}
              >
                Khora builds tools for creating, registering, and discovering autonomous agents
                with verifiable on-chain identities.
              </p>
            </div>

            {/* Products */}
            <div className="mt-24 space-y-6">
              <p className="text-[10px] text-muted-foreground uppercase text-center" style={font}>
                products
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                {PRODUCTS.map((product) => (
                  <Link
                    key={product.name}
                    href={product.href}
                    className="group border border-neutral-200 dark:border-neutral-700 p-6 space-y-4 hover:border-foreground transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg text-foreground" style={font}>
                          {product.name}
                        </h3>
                        <p className="text-[10px] text-muted-foreground/60 uppercase mt-0.5" style={font}>
                          {product.tagline}
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                      {product.desc}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {product.features.map((f) => (
                        <span
                          key={f}
                          className="text-[10px] text-muted-foreground/70 border border-neutral-200 dark:border-neutral-700 px-2 py-0.5"
                          style={font}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                    <span
                      className="inline-block text-xs text-foreground border-b border-foreground group-hover:opacity-70 transition-opacity"
                      style={font}
                    >
                      {product.cta}
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {/* About Khora */}
            <div className="mt-24 max-w-2xl mx-auto space-y-12">

              <div className="space-y-4">
                <h2 className="text-lg text-foreground" style={font}>About Khora</h2>
                <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                  Khora is an open-source studio building infrastructure for AI agents
                  on the blockchain. We use ERC-8004, the on-chain identity registry
                  standard, to give every agent a verifiable, decentralized identity —
                  like a passport for autonomous software.
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                  Our tools let you create agents from scratch, import existing NFTs
                  as agents, and register them on-chain so they&apos;re discoverable
                  across the entire agent ecosystem. Everything we build is fully
                  open source.
                </p>
              </div>

              {/* Pillars */}
              <div className="space-y-4">
                <h2 className="text-lg text-foreground" style={font}>What we build</h2>
                <div className="space-y-3">
                  {PILLARS.map((pillar, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="text-xs text-muted-foreground mt-0.5 flex-shrink-0" style={font}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div>
                        <span className="text-sm text-foreground" style={font}>{pillar.title}</span>
                        <p className="text-sm text-muted-foreground leading-relaxed mt-0.5" style={font}>
                          {pillar.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* ERC-8004 */}
              <div className="space-y-4">
                <h2 className="text-lg text-foreground" style={font}>ERC-8004</h2>
                <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                  ERC-8004 is an on-chain identity registry standard for AI agents.
                  It stores an agent&apos;s name, description, services, skills,
                  domains, and metadata as a data URI directly on-chain. Any protocol,
                  marketplace, or application can read this identity without trusting
                  a centralized server.
                </p>
                <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                  The Identity Registry is deployed on 10 chains at the same address
                  via deterministic CREATE2. Agents can register on any chain, and
                  Khora discovers them all in parallel.
                </p>
              </div>

              {/* Stack */}
              <div className="space-y-4">
                <h2 className="text-lg text-foreground" style={font}>Stack</h2>
                <div className="grid grid-cols-2 gap-y-2 gap-x-8">
                  {TECH_STACK.map(([label, value]) => (
                    <div key={label} className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground uppercase" style={font}>
                        {label}
                      </span>
                      <span className="text-xs text-foreground" style={font}>
                        {value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Open source */}
              <div className="space-y-4">
                <h2 className="text-lg text-foreground flex items-center gap-2" style={font}>
                  <Github className="w-5 h-5" />
                  Open source
                </h2>
                <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                  Khora is fully open source. Smart contracts, frontend,
                  and AI pipeline are all public. You can fork it, extend it,
                  or build on top of it.
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

              {/* $KHORA */}
              <div className="space-y-4">
                <h2 className="text-sm text-muted-foreground/60" style={font}>$KHORA</h2>
                <p className="text-[11px] text-muted-foreground/60 leading-relaxed" style={font}>
                  Community token on Solana.
                </p>
                <p className="text-[11px] text-muted-foreground/60 break-all" style={font}>
                  4hiBZfhcLPoLJXoptEoMZANaTdc6ygPqQMraFx6vmoon
                </p>
              </div>

            </div>
          </div>
          <div className="hidden lg:block lg:col-span-1" />
        </div>
      </div>
    </div>
  );
}
