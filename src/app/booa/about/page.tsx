// /src/app/booa/about/page.tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Github, ArrowLeft } from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';

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

export default function BOOAAboutPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="p-4 md:p-8 lg:p-12">
          <div className="w-full lg:grid lg:grid-cols-12">
            <div className="hidden lg:block lg:col-span-1" />
            <div className="lg:col-span-10">
              <div className="max-w-2xl space-y-12">

                {/* Back button */}
                <Link
                  href="/booa"
                  className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  style={font}
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back to BOOA
                </Link>

                {/* Title */}
                <div className="space-y-4">
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest" style={font}>
                    a Khora product
                  </p>
                  <h1
                    className="text-2xl sm:text-3xl text-foreground"
                    style={font}
                  >
                    About BOOA
                  </h1>
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
                <AboutHowItWorks />

                {/* Fully on-chain */}
                <div className="space-y-4">
                  <h2 className="text-lg text-foreground" style={font}>
                    Fully on-chain
                  </h2>
                  <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                    Most NFTs store a link to an image hosted somewhere else.
                    If that server goes down, your NFT is gone. BOOA agents
                    are different — the pixel art is stored as a 2,048-byte
                    bitmap and traits are packed into bytes, all written directly
                    into the smart contract via SSTORE2. The Renderer contract
                    converts the bitmap to SVG on-the-fly. No external dependencies,
                    no injection vectors — every nibble maps to a valid C64 color.
                  </p>
                </div>

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
                    The Identity Registry is deployed on 16 chains at the same address
                    via deterministic CREATE2. Agents can register on any chain, and
                    Khora discovers them all in parallel.
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
                        Hit mint — AI generates the full agent identity (creature type,
                        personality, vibe, skills, boundaries) and a unique pixel art
                        portrait in one click. Confirm a single wallet transaction to
                        write the bitmap and traits on-chain. After minting, you can
                        optionally register the agent on the ERC-8004 Identity Registry
                        to make it discoverable, and configure services, skills,
                        and domains for power users.
                      </p>
                    </div>
                    <div>
                      <span className="text-sm text-foreground" style={font}>Import mode</span>
                      <p className="text-sm text-muted-foreground leading-relaxed mt-0.5" style={font}>
                        Already have an agent registered on ERC-8004? Connect your
                        wallet and we scan 16 chains for your registered agents. Select
                        one and its identity is fetched from the on-chain registry —
                        name, description, services, skills, domains. AI generates a
                        new portrait for the imported identity. After minting, the
                        &quot;Register&quot; button becomes &quot;Update&quot; — it calls
                        setAgentURI to update your existing registry entry with the
                        new on-chain art.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Stack */}
                <div className="space-y-4">
                  <h2 className="text-lg text-foreground" style={font}>
                    Stack
                  </h2>
                  <div className="grid grid-cols-2 gap-y-2 gap-x-8">
                    {[
                      ['Chain', 'Shape (Ethereum L2)'],
                      ['Contract', 'ERC-721 + ERC-2981'],
                      ['Storage', 'SSTORE2 bitmap (2KB)'],
                      ['Rendering', 'On-chain SVG'],
                      ['Registry', 'ERC-8004'],
                      ['Art', 'AI pixel art → bitmap'],
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
                  <Link
                    href="/booa/mint"
                    className="text-sm text-foreground border-b border-foreground hover:opacity-70 transition-opacity"
                    style={font}
                  >
                    Mint a BOOA
                  </Link>
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
