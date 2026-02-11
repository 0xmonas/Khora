// /src/app/about/page.tsx
'use client';
import { useState } from 'react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';

const font = { fontFamily: 'var(--font-departure-mono)' };

const CREATE_STEPS = [
  { num: '01', title: 'Describe', desc: 'Describe your character — name, creature type, vibe, personality traits, skills, and boundaries. Or let AI generate one from a simple prompt.' },
  { num: '02', title: 'Generate', desc: 'AI generates a unique pixel art portrait and a complete character profile. The image is converted to a compact on-chain SVG — no external hosting, no IPFS, no links that can break.' },
  { num: '03', title: 'Mint', desc: 'Mint your character using a commit-reveal pattern. First you commit (reserves your slot), then reveal (writes the SVG and traits on-chain). This prevents front-running.' },
  { num: '04', title: 'On-chain forever', desc: 'Your character is now permanently on-chain. Anyone can read its traits, render its art, and verify its authenticity — directly from the contract, forever.' },
];

const IMPORT_STEPS = [
  { num: '01', title: 'Connect', desc: 'Connect your wallet. We scan 9 chains for your registered ERC-8004 agents — or enter a token ID manually.' },
  { num: '02', title: 'Fetch', desc: 'Your agent\'s identity is pulled from the on-chain registry: name, creature, vibe, skills, and boundaries.' },
  { num: '03', title: 'Reimagine', desc: 'AI generates a brand-new pixel art portrait for your imported agent, preserving its original identity and traits.' },
  { num: '04', title: 'Mint on Base', desc: 'Your reimagined agent is minted on Base with its new art and original traits — fully on-chain, cross-chain identity.' },
];

function AboutHowItWorks() {
  const [activeMode, setActiveMode] = useState<'create' | 'import'>('create');
  const steps = activeMode === 'create' ? CREATE_STEPS : IMPORT_STEPS;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <h2 className="text-lg text-foreground" style={font}>
          How it works
        </h2>
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
  );
}

export default function AboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="p-4 md:p-8 lg:p-12">
          <div className="w-full lg:grid lg:grid-cols-12">
            <div className="hidden lg:block lg:col-span-1" />
            <div className="lg:col-span-10">
              <div className="max-w-2xl space-y-12">

                {/* Title */}
                <div className="space-y-4">
                  <h1
                    className="text-2xl sm:text-3xl text-foreground"
                    style={font}
                  >
                    About Khora
                  </h1>
                  <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                    Khora is an open-source platform for creating AI characters
                    that live entirely on-chain. Every character you generate is
                    minted as an NFT on Base — its pixel art, personality, skills,
                    and boundaries are all stored permanently in the smart contract.
                  </p>
                </div>

                {/* How it works */}
                <AboutHowItWorks />

                {/* ERC-8004 */}
                <div className="space-y-4">
                  <h2 className="text-lg text-foreground" style={font}>
                    What is ERC-8004?
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                    ERC-8004 is an on-chain identity registry standard for AI agents.
                    It gives every agent a verifiable, decentralized identity — like a
                    passport for autonomous software. The registry stores the agent&apos;s
                    name, description, services, skills, domains, and metadata as a
                    data URI directly on-chain. Any protocol, marketplace, or
                    application can read this identity without trusting a centralized
                    server.
                  </p>
                  <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                    Khora uses ERC-8004 to make your AI characters discoverable across
                    the agent ecosystem. When you register an agent, it gets listed in
                    the Identity Registry on Base — other apps can find it, read its
                    capabilities, and interact with it.
                  </p>
                </div>

                {/* 8004 Config */}
                <div className="space-y-4">
                  <h2 className="text-lg text-foreground" style={font}>
                    ERC-8004 Config
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                    When creating or importing an agent, you can configure its on-chain
                    identity through the ERC-8004 Config panel:
                  </p>
                  <div className="space-y-3 pl-2 border-l border-border">
                    {[
                      ['Services', 'Declare how your agent can be reached. Add service endpoints like A2A (Agent-to-Agent), MCP, or web URLs. Each service entry includes a protocol type and an endpoint URL.'],
                      ['Skills (OASF)', 'Tag your agent with capabilities from the OASF taxonomy — text-generation, image-creation, swap-execution, summarization, etc. Skills tell other agents what yours can do.'],
                      ['Domains (OASF)', 'Categorize your agent into domains like DeFi, gaming, social, healthcare, etc. Domains help with discovery and filtering.'],
                      ['x402 Payment', 'Enable or disable x402 protocol support. When enabled, your agent signals that it can accept HTTP 402 micropayments for its services.'],
                      ['Supported Trust', 'Declare which trust mechanisms your agent supports — reputation, crypto-economic staking, or TEE (Trusted Execution Environment).'],
                    ].map(([label, desc]) => (
                      <div key={label}>
                        <span className="text-sm text-foreground" style={font}>{label}</span>
                        <p className="text-sm text-muted-foreground leading-relaxed mt-0.5" style={font}>
                          {desc}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                    All config fields are optional. You can mint a character with no
                    8004 config and register it later from the Collection page.
                  </p>
                </div>

                {/* Create vs Import */}
                <div className="space-y-4">
                  <h2 className="text-lg text-foreground" style={font}>
                    Create vs Import
                  </h2>
                  <div className="space-y-3">
                    <div>
                      <span className="text-sm text-foreground" style={font}>Create mode</span>
                      <p className="text-sm text-muted-foreground leading-relaxed mt-0.5" style={font}>
                        Start from scratch. Enter a name and description, optionally
                        configure ERC-8004 settings, and mint. AI generates the full
                        agent identity (creature type, personality, vibe) and a unique
                        portrait. After minting, you can optionally register the agent
                        on the ERC-8004 Identity Registry — this is a separate on-chain
                        transaction that makes your agent discoverable.
                      </p>
                    </div>
                    <div>
                      <span className="text-sm text-foreground" style={font}>Import mode</span>
                      <p className="text-sm text-muted-foreground leading-relaxed mt-0.5" style={font}>
                        Already have an agent registered on ERC-8004? Connect your
                        wallet and we scan 9 chains for your registered agents. Select
                        one and its identity is fetched from the on-chain registry —
                        name, description, services, skills, domains. You can edit any
                        field before minting. AI generates a new portrait for the
                        imported identity. After minting, the &quot;Register&quot; button
                        becomes &quot;Update&quot; — it calls setAgentURI to update your
                        existing registry entry with the new on-chain art and any
                        edited metadata.
                      </p>
                    </div>
                  </div>
                </div>

                {/* On-chain */}
                <div className="space-y-4">
                  <h2
                    className="text-lg text-foreground"
                    style={font}
                  >
                    Fully on-chain
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                    Most NFTs store a link to an image hosted somewhere else.
                    If that server goes down, your NFT is gone. Khora characters
                    are different — the SVG pixel art and the JSON traits are
                    written directly into the smart contract using SSTORE2.
                    No external dependencies. The contract validates every SVG
                    before storing it, blocking scripts, iframes, and other
                    unsafe elements.
                  </p>
                </div>

                {/* Stack */}
                <div className="space-y-4">
                  <h2
                    className="text-lg text-foreground"
                    style={font}
                  >
                    Stack
                  </h2>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-8">
                    {[
                      ['Chain', 'Base (Ethereum L2)'],
                      ['Contract', 'ERC-721 + ERC-2981'],
                      ['Storage', 'SSTORE2 (on-chain)'],
                      ['Registry', 'ERC-8004'],
                      ['Art', 'AI pixel art → SVG'],
                      ['Frontend', 'Next.js + wagmi'],
                      ['AI', 'Gemini + Replicate'],
                      ['Taxonomy', 'OASF v0.8.0'],
                    ].map(([label, value]) => (
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
                  <h2
                    className="text-lg text-foreground"
                    style={font}
                  >
                    Open source
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                    Khora is fully open source. The smart contract, frontend,
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

                {/* OpenSea */}
                <div className="space-y-4">
                  <h2 className="text-lg text-foreground" style={font}>
                    OpenSea
                  </h2>
                  <a
                    href="https://opensea.io/collection/booa-nft"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block text-sm text-foreground border-b border-foreground hover:opacity-70 transition-opacity"
                    style={font}
                  >
                    opensea.io/collection/booa-nft
                  </a>
                </div>

                {/* Token */}
                <div className="space-y-4">
                  <h2
                    className="text-lg text-foreground"
                    style={font}
                  >
                    $KHORA
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                    Community token on Solana.
                  </p>
                  <p
                    className="text-xs text-muted-foreground break-all"
                    style={font}
                  >
                    4hiBZfhcLPoLJXoptEoMZANaTdc6ygPqQMraFx6vmoon
                  </p>
                </div>

              </div>
            </div>
            <div className="hidden lg:block lg:col-span-1" />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
