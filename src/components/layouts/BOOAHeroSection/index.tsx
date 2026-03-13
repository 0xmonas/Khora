import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Github } from 'lucide-react';
import { useGalleryTokens } from '@/hooks/useGalleryTokens';
import { useReadContract, useChainId } from 'wagmi';
import { BOOA_V2_ABI, BOOA_V2_MINTER_ABI, getV2Address, getV2MinterAddress, getV2ChainId } from '@/lib/contracts/booa-v2';

const font = { fontFamily: 'var(--font-departure-mono)' };

const CREATE_STEPS = [
  { num: '01', title: 'Mint', desc: 'One click — AI generates a full agent identity: creature type, personality, pixel art portrait, skills, and behavioral boundaries. You confirm a single wallet transaction.' },
  { num: '02', title: 'Stored on-chain', desc: 'The portrait is encoded as a 2,048-byte bitmap (64x64, C64 palette) and stored via SSTORE2 directly in the contract. Traits are packed into bytes. No IPFS, no external hosting — your agent lives on Shape forever.' },
  { num: '03', title: 'Register on ERC-8004', desc: 'Optionally register your agent on the ERC-8004 Identity Registry — the on-chain passport for AI agents. Configure services, skills (OASF taxonomy), domains, and x402 payment support. Makes your agent discoverable across 16 chains.' },
  { num: '04', title: 'Export anywhere', desc: 'Download as PNG, SVG, ERC-8004 JSON, or OpenClaw format (IDENTITY.md + SOUL.md) so your agent can operate autonomously on platforms like Moltbook. Your character\'s personality and boundaries travel with it.' },
];

const IMPORT_STEPS = [
  { num: '01', title: 'Discover', desc: 'Connect your wallet — we scan 16 chains in parallel for your registered ERC-8004 agents. Or enter a token ID manually. Your existing agent identities appear instantly.' },
  { num: '02', title: 'Reimagine', desc: 'Select an agent — AI generates a brand-new pixel art portrait while preserving the original identity: name, description, skills, domains, personality. Same soul, new face.' },
  { num: '03', title: 'Mint & update', desc: 'Mint the new portrait on Shape in one transaction. Then update your existing ERC-8004 registry entry with the on-chain art via setAgentURI — no new registration needed.' },
];

function LiveStats() {
  const chainId = useChainId();
  const booaAddress = getV2Address(chainId);
  const minterAddress = getV2MinterAddress(chainId);
  const targetChainId = getV2ChainId(chainId);
  const enabled = !!booaAddress && booaAddress.length > 2;

  const { data: totalSupply } = useReadContract({
    address: booaAddress,
    abi: BOOA_V2_ABI,
    functionName: 'totalSupply',
    chainId: targetChainId,
    query: { enabled },
  });

  const { data: mintPrice } = useReadContract({
    address: minterAddress,
    abi: BOOA_V2_MINTER_ABI,
    functionName: 'mintPrice',
    chainId: targetChainId,
    query: { enabled: !!minterAddress && minterAddress.length > 2 },
  });

  const count = totalSupply !== undefined ? Number(totalSupply) : null;
  const price = mintPrice !== undefined ? Number(mintPrice) / 1e18 : null;

  if (!enabled) return null;

  return (
    <div className="flex flex-wrap justify-center gap-8 sm:gap-12">
      {count !== null && (
        <div className="text-center">
          <p className="text-2xl sm:text-3xl text-foreground" style={font}>{count}</p>
          <p className="text-[10px] text-muted-foreground uppercase mt-1" style={font}>agents minted</p>
        </div>
      )}
      {price !== null && (
        <div className="text-center">
          <p className="text-2xl sm:text-3xl text-foreground" style={font}>
            {price === 0 ? 'FREE' : `${price} ETH`}
          </p>
          <p className="text-[10px] text-muted-foreground uppercase mt-1" style={font}>mint price</p>
        </div>
      )}
      <div className="text-center">
        <p className="text-2xl sm:text-3xl text-foreground" style={font}>100%</p>
        <p className="text-[10px] text-muted-foreground uppercase mt-1" style={font}>on-chain</p>
      </div>
    </div>
  );
}

function RecentMints() {
  const { tokens, isLoading } = useGalleryTokens();

  const recent = [...tokens]
    .sort((a, b) => Number(b.tokenId - a.tokenId))
    .slice(0, 8)
    .filter(t => t.svg);

  if (isLoading || recent.length === 0) return null;

  return (
    <div className="space-y-4">
      <p className="text-[10px] text-muted-foreground uppercase text-center" style={font}>
        recent mints
      </p>
      <div className="flex justify-center gap-3 flex-wrap">
        {recent.map((token) => (
          <Link
            key={token.tokenId.toString()}
            href="/booa/mint"
            className="group"
          >
            <div className="w-16 h-16 sm:w-20 sm:h-20 border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800 overflow-hidden transition-transform duration-200 group-hover:scale-110">
              <img
                src={`data:image/svg+xml,${encodeURIComponent(token.svg!)}`}
                alt={`Agent #${token.tokenId.toString()}`}
                className="w-full h-full object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
            <p className="text-[9px] text-muted-foreground text-center mt-1" style={font}>
              #{token.tokenId.toString()}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

function AboutSection() {
  const [activeMode, setActiveMode] = useState<'create' | 'import'>('create');
  const steps = activeMode === 'create' ? CREATE_STEPS : IMPORT_STEPS;

  return (
    <div className="mt-20 max-w-2xl mx-auto space-y-12">

      {/* About BOOA */}
      <div className="space-y-4">
        <h2 className="text-lg text-foreground" style={font}>About BOOA</h2>
        <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
          BOOA{' '}
          <span className="text-[11px] text-muted-foreground/60">(Born On-chain Owned Agents)</span>
          {' '}is a fully on-chain AI character collection on Shape. Each agent has
          a unique pixel art portrait, personality, skills, and behavioral
          boundaries — all generated by AI and stored permanently in the smart
          contract. No IPFS, no external hosting.
        </p>
        <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
          What makes BOOA different: agents can be registered on the ERC-8004
          Identity Registry — the first on-chain passport standard for AI agents.
          This makes them discoverable across 16 chains, with configurable
          services, skills, and payment support. You can also export your agent
          in OpenClaw format so it can operate autonomously on platforms like Moltbook.
        </p>
      </div>

      {/* How it works */}
      <div className="space-y-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg text-foreground" style={font}>How it works</h2>
          <div className="flex gap-2">
            {(['create', 'import'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setActiveMode(m)}
                className={`px-2 py-0.5 font-mono text-[10px] border transition-colors ${
                  activeMode === m
                    ? 'bg-foreground text-background border-foreground'
                    : 'bg-transparent text-muted-foreground border-border hover:border-foreground'
                }`}
                style={font}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-3">
          {steps.map((step) => (
            <div key={step.num} className="flex gap-3">
              <span className="text-xs text-muted-foreground mt-0.5 flex-shrink-0" style={font}>
                {step.num}
              </span>
              <div>
                <span className="text-sm text-foreground" style={font}>{step.title}</span>
                <p className="text-sm text-muted-foreground leading-relaxed mt-0.5" style={font}>
                  {step.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Links */}
      <div className="flex flex-wrap gap-6">
        <a
          href="https://github.com/0xmonas/Khora"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-sm text-foreground border-b border-foreground hover:opacity-70 transition-opacity"
          style={font}
        >
          <Github className="w-4 h-4" />
          GitHub
        </a>
        <a
          href="https://opensea.io/collection/booa-nft"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-2 text-sm text-foreground border-b border-foreground hover:opacity-70 transition-opacity"
          style={font}
        >
          <img src="/openseatransparent.svg" alt="OpenSea" className="w-4 h-4 invert dark:invert-0" />
          OpenSea
        </a>
      </div>

    </div>
  );
}

const FAQ_ITEMS = [
  {
    q: 'Is the art really 100% on-chain?',
    a: 'Yes. The pixel art is stored as a 2,048-byte bitmap and traits are packed into bytes, all written directly into the smart contract via SSTORE2. The Renderer contract converts the bitmap to SVG on-the-fly. No server, no IPFS, no external dependency. Even if khora.fun disappears, your NFT renders from the contract alone.',
  },
  {
    q: 'Why pixel art?',
    a: 'On-chain storage is expensive. A high-res PNG would cost thousands of dollars in gas. Pixel art at 64x64 with a C64 16-color palette encodes into a fixed 2,048-byte bitmap — each pixel is a 4-bit palette index, two pixels per byte. The aesthetic isn\'t a limitation, it\'s the solution.',
  },
  {
    q: 'What is ERC-8004?',
    a: 'ERC-8004 is an on-chain identity registry standard for AI agents — like a passport for autonomous software. It stores an agent\'s name, description, services, skills, and domains in a registry contract. This makes agents discoverable and verifiable across any platform.',
  },
  {
    q: 'What can I configure in the ERC-8004 registration?',
    a: 'Services (A2A, MCP, web endpoints), Skills (OASF taxonomy — text-generation, image-creation, etc.), Domains (DeFi, gaming, social, etc.), x402 payment support, and trust mechanisms. All fields are optional — you can mint with no config and register later.',
  },
  {
    q: 'What\'s the difference between Create and Import mode?',
    a: 'Create mode generates a brand-new agent identity and portrait from scratch. Import mode lets you bring in an existing ERC-8004 agent from any of 16 chains — AI generates a new pixel art portrait while preserving the original identity. After minting, you can update your existing registry entry with the new art.',
  },
  {
    q: 'Can AI agents use BOOA NFTs as their profile picture?',
    a: 'Yes — when you register on the ERC-8004 Identity Registry, the on-chain SVG from your BOOA bitmap is embedded directly into the registration as a data URI. Any framework or agent runtime can read this image directly from the contract.',
  },
  {
    q: 'Can an AI agent own a BOOA NFT?',
    a: 'Yes. BOOA is a standard ERC-721 contract — any Ethereum address can own one, including smart contract wallets controlled by AI agents.',
  },
  {
    q: 'What export formats are available?',
    a: 'PNG (pixel art with embedded JSON), SVG (from on-chain bitmap), ERC-8004 JSON, OpenClaw ZIP (IDENTITY.md + SOUL.md — deploy your agent on platforms like Moltbook), and raw JSON.',
  },
];

function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="mt-20">
      <p className="text-[10px] text-muted-foreground uppercase text-center mb-8" style={font}>
        faq
      </p>
      <div className="max-w-3xl mx-auto space-y-2">
        {FAQ_ITEMS.map((item, i) => (
          <div
            key={i}
            className="border border-neutral-200 dark:border-neutral-700"
          >
            <button
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              className="w-full text-left p-4 flex justify-between items-start gap-4"
            >
              <span className="text-xs text-foreground leading-relaxed" style={font}>
                {item.q}
              </span>
              <span className="text-xs text-muted-foreground flex-shrink-0 mt-0.5" style={font}>
                {openIndex === i ? '\u2212' : '+'}
              </span>
            </button>
            {openIndex === i && (
              <div className="px-4 pb-4">
                <p className="text-xs text-muted-foreground leading-relaxed" style={font}>
                  {item.a}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function BOOAHeroSection() {
  const router = useRouter();

  return (
    <div className="flex-1 flex flex-col">
      <div className="p-4 md:p-8 lg:p-12">
        <div className="w-full lg:grid lg:grid-cols-12">
          <div className="hidden lg:block lg:col-span-1" />
          <div className="lg:col-span-10">

            {/* BOOA Hero */}
            <div className="flex flex-col items-center">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest" style={font}>
                a Khora product
              </p>
              <h1
                className="text-4xl sm:text-5xl md:text-6xl text-foreground mt-4"
                style={font}
              >
                BOOA
              </h1>
              <p
                className="text-sm text-muted-foreground/60 mt-2"
                style={font}
              >
                Born On-chain Owned Agents
              </p>
              <div className="flex gap-4 mt-8">
                <button
                  onClick={() => router.replace('/booa/mint')}
                  className="h-10 sm:h-12 px-6 border-2 border-primary bg-background text-foreground hover:bg-accent transition-colors w-fit"
                  style={font}
                >
                  Mint a BOOA
                </button>
                <Link
                  href="/booa/about"
                  className="h-10 sm:h-12 px-6 border border-neutral-300 dark:border-neutral-600 bg-background text-muted-foreground hover:text-foreground hover:border-foreground transition-colors flex items-center"
                  style={font}
                >
                  Learn more
                </Link>
              </div>
            </div>

            {/* Live Stats + Recent Mints */}
            <div className="mt-20 space-y-8">
              <LiveStats />
              <RecentMints />
            </div>

            {/* About + How it works */}
            <AboutSection />

            {/* FAQ */}
            <FAQ />

          </div>
          <div className="hidden lg:block lg:col-span-1" />
        </div>
      </div>
    </div>
  );
}
