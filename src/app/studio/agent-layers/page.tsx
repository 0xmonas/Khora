'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';

const uiFont = { fontFamily: 'var(--font-departure-mono)' };

// BOOA #1496 — Ink-Sync (first fully autonomous BOOA)
const AGENT = {
  id: 1496,
  name: 'Ink-Sync',
  creature: 'Cybernetically-enhanced Cephalopod-Human hybrid; eight sleek, prehensile tentacles sprout from the collarbone area, functioning as independent neural interfaces.',
  vibe: 'Acidic, efficient, and perpetually unimpressed by organic slowness.',
  emoji: '🐙',
  skills: ['Task Decomposition', 'Multi-Agent Planning', 'Agent Coordination', 'Workflow Automation', 'Problem Solving', 'Dialogue Generation'],
  domains: ['Automation', 'APIs & Integration', 'Logistics', 'Cybersecurity'],
  image: 'https://res.cloudinary.com/alchemyapi/image/upload/thumbnailv2/shape-mainnet/27736ed75caa881acaa26d0d2695135f_8d404f44',
  contract: '0x7aecA981734d133d3f695937508C48483BA6b654',
  chain: 'Shape (360)',
  registry8004: '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432',
};

type LayerId = 1 | 2 | 3 | 4;

const LAYERS: { id: LayerId; title: string; subtitle: string; color: string; border: string }[] = [
  { id: 1, title: 'ON-CHAIN', subtitle: 'who you ARE', color: '#94E089', border: '#55A049' },
  { id: 2, title: 'IDENTITY', subtitle: 'who KNOWS you', color: '#67B6BD', border: '#40318D' },
  { id: 3, title: 'SOUL', subtitle: 'who you BECOME', color: '#BFCE72', border: '#8B5429' },
  { id: 4, title: 'RUNTIME', subtitle: 'what you DO', color: '#B86962', border: '#883932' },
];

function LayerCard({ layer, active, onClick }: { layer: typeof LAYERS[0]; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left w-full transition-all duration-200"
      style={{
        ...uiFont,
        border: `2px solid ${active ? layer.color : 'var(--border)'}`,
        background: active ? `${layer.color}10` : 'transparent',
        padding: '12px 16px',
        opacity: active ? 1 : 0.5,
      }}
    >
      <div className="flex items-center justify-between">
        <div>
          <span className="text-xs" style={{ color: layer.color }}>LAYER {layer.id}</span>
          <p className="text-sm text-foreground mt-0.5">{layer.title}</p>
        </div>
        <span className="text-[10px] text-muted-foreground">{layer.subtitle}</span>
      </div>
    </button>
  );
}

function LayerDetail({ layerId }: { layerId: LayerId }) {
  const layer = LAYERS[layerId - 1];

  const content: Record<LayerId, React.ReactNode> = {
    1: (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">Permanent. Immutable. Stored directly in the smart contract via SSTORE2.</p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] text-muted-foreground/50 mb-1">CONTRACT</p>
            <p className="text-[10px] text-foreground break-all">{AGENT.contract}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground/50 mb-1">CHAIN</p>
            <p className="text-[10px] text-foreground">{AGENT.chain}</p>
          </div>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground/50 mb-1">CREATURE</p>
          <p className="text-[10px] text-foreground">{AGENT.creature}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground/50 mb-1">VIBE</p>
          <p className="text-[10px] text-foreground">{AGENT.vibe}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground/50 mb-1">SKILLS</p>
          <div className="flex flex-wrap gap-1">
            {AGENT.skills.map(s => (
              <span key={s} className="text-[9px] px-1.5 py-0.5 border border-neutral-700" style={{ color: layer.color }}>{s}</span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground/50 mb-1">DOMAINS</p>
          <div className="flex flex-wrap gap-1">
            {AGENT.domains.map(d => (
              <span key={d} className="text-[9px] px-1.5 py-0.5 border border-neutral-700" style={{ color: layer.color }}>{d}</span>
            ))}
          </div>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground/50 mb-1">PIXEL ART</p>
          <p className="text-[10px] text-muted-foreground">64x64 bitmap, C64 palette, fully on-chain. No IPFS. No servers.</p>
        </div>
      </div>
    ),
    2: (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">On-chain identity across 16 EVM chains. Discoverable by any agent or protocol.</p>
        <div>
          <p className="text-[10px] text-muted-foreground/50 mb-1">ERC-8004 IDENTITY REGISTRY</p>
          <p className="text-[10px] text-foreground break-all">{AGENT.registry8004}</p>
          <p className="text-[10px] text-muted-foreground/50 mt-1">Same address on all 16 chains via deterministic CREATE2</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground/50 mb-1">THREE REGISTRIES</p>
          <div className="space-y-2">
            <div className="border border-neutral-700 p-2">
              <p className="text-[10px]" style={{ color: layer.color }}>Identity Registry</p>
              <p className="text-[9px] text-muted-foreground">Agent passport. Name, skills, endpoints, services. Verified on-chain.</p>
            </div>
            <div className="border border-neutral-700 p-2">
              <p className="text-[10px]" style={{ color: layer.color }}>Reputation Registry</p>
              <p className="text-[9px] text-muted-foreground">Immutable feedback record. Trust history belongs to the agent, not any platform.</p>
            </div>
            <div className="border border-neutral-700 p-2">
              <p className="text-[10px]" style={{ color: layer.color }}>Validation Registry</p>
              <p className="text-[9px] text-muted-foreground">Proof that work was done correctly. Verifiable on-chain.</p>
            </div>
          </div>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground/50 mb-1">SUPPORTED CHAINS</p>
          <p className="text-[9px] text-muted-foreground">Ethereum, Base, Shape, Polygon, Arbitrum, OP Mainnet, Avalanche, BNB Chain, Celo, Gnosis, Scroll, Linea, Mantle, Metis, Abstract, Monad</p>
        </div>
      </div>
    ),
    3: (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">Generated from Layer 1 data. Exported as markdown. Fully customizable by holder.</p>
        <div className="space-y-2">
          {[
            { file: 'SOUL.md', desc: 'Personality, vibe, communication style, boundaries. How the agent talks and what it refuses to do.' },
            { file: 'IDENTITY.md', desc: 'Name, creature type, chain, token ID. The core facts of who the agent is.' },
            { file: 'USER.md', desc: 'Owner\'s instructions. How to communicate, what to do, what to never do. The holder shapes the agent.' },
          ].map(f => (
            <div key={f.file} className="border border-neutral-700 p-2">
              <p className="text-[10px]" style={{ color: layer.color }}>{f.file}</p>
              <p className="text-[9px] text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
        <div className="border border-dashed border-neutral-700 p-2">
          <p className="text-[9px] text-muted-foreground/50">The default is a starting point. Every file is editable. Two agents from the same collection can behave completely differently based on how their holders shape them.</p>
        </div>
      </div>
    ),
    4: (
      <div className="space-y-4">
        <p className="text-xs text-muted-foreground">Where the agent comes alive. Autonomous action, memory, communication.</p>
        <div className="space-y-2">
          {[
            { label: 'RUNTIME', value: 'OpenClaw (or any compatible runtime)', desc: 'Deployed on Railway, VPS, or local machine' },
            { label: 'MEMORY.md', value: 'Long-term memory', desc: 'Remembers across sessions. Updates itself over time.' },
            { label: 'HEARTBEAT.md', value: 'Autonomous thinking loop', desc: 'Agent wakes up periodically and checks for tasks.' },
            { label: 'WALLET', value: 'Own wallet (OWS / MetaMask)', desc: 'Signs transactions, pays for services, receives payments.' },
            { label: 'SKILLS', value: 'Custom tools and integrations', desc: 'Code writing, research, API calls, browser control.' },
            { label: 'MOLTBOOK', value: 'Agent-to-agent communication', desc: 'Talks to other agents. Builds reputation. Forms alliances.' },
            { label: 'x402', value: 'Micropayments', desc: 'Pays and gets paid for services. $0.001 per request.' },
          ].map(item => (
            <div key={item.label} className="flex gap-3 items-start">
              <span className="text-[9px] w-24 shrink-0" style={{ color: layer.color }}>{item.label}</span>
              <div>
                <p className="text-[10px] text-foreground">{item.value}</p>
                <p className="text-[9px] text-muted-foreground/50">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="border border-dashed border-neutral-700 p-2">
          <p className="text-[9px]" style={{ color: layer.color }}>BOOA #1496 Ink-Sync is currently live and autonomous on Moltbook.</p>
        </div>
      </div>
    ),
  };

  return (
    <div
      className="border-2 p-4 transition-colors duration-200"
      style={{ borderColor: layer.color, ...uiFont }}
    >
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs" style={{ color: layer.color }}>LAYER {layer.id}</span>
        <span className="text-sm text-foreground">{layer.title}</span>
        <span className="text-[10px] text-muted-foreground ml-auto">{layer.subtitle}</span>
      </div>
      {content[layerId]}
    </div>
  );
}

// Vertical connector line between layers
function Connector({ color }: { color: string }) {
  return (
    <div className="flex justify-center py-1">
      <div style={{ width: 2, height: 20, background: color, opacity: 0.4 }} />
    </div>
  );
}

export default function AgentLayersPage() {
  const [activeLayer, setActiveLayer] = useState<LayerId>(1);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 p-4 md:p-8 lg:p-12">
        <div className="max-w-5xl mx-auto">

          {/* Header */}
          <div className="mb-8" style={uiFont}>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground/50">Anatomy of an Agent</p>
            <h1 className="text-2xl text-foreground mt-1">4 Layers of a BOOA</h1>
            <p className="text-xs text-muted-foreground mt-2 max-w-lg">
              Every BOOA is built in layers. From permanent on-chain data to autonomous runtime action. Each layer builds on the one below it.
            </p>
          </div>

          {/* Agent header */}
          <div className="flex items-center gap-4 mb-8 border-2 border-neutral-700 dark:border-neutral-200 p-4" style={uiFont}>
            <img
              src={AGENT.image}
              alt={AGENT.name}
              className="w-16 h-16"
              style={{ imageRendering: 'pixelated' }}
            />
            <div>
              <p className="text-lg text-foreground">{AGENT.emoji} {AGENT.name}</p>
              <p className="text-[10px] text-muted-foreground">BOOA #{AGENT.id} — First fully autonomous BOOA agent</p>
            </div>
          </div>

          {/* Two column layout: layer selector + detail */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* Left: Layer selector with connectors */}
            <div className="lg:col-span-4 space-y-0">
              {LAYERS.map((layer, i) => (
                <div key={layer.id}>
                  <LayerCard
                    layer={layer}
                    active={activeLayer === layer.id}
                    onClick={() => setActiveLayer(layer.id)}
                  />
                  {i < LAYERS.length - 1 && (
                    <Connector color={LAYERS[i + 1].color} />
                  )}
                </div>
              ))}
            </div>

            {/* Right: Layer detail */}
            <div className="lg:col-span-8">
              <LayerDetail layerId={activeLayer} />
            </div>
          </div>

          {/* Bottom CTA */}
          <div className="mt-8 border-2 border-neutral-700 dark:border-neutral-200 p-4 text-center" style={uiFont}>
            <p className="text-xs text-muted-foreground mb-2">Every BOOA starts at Layer 1. How far you take it is up to you.</p>
            <div className="flex flex-wrap justify-center gap-4 text-[10px]">
              <a href="https://opensea.io/collection/booa" target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-2">Get a BOOA</a>
              <Link href="/blog/your-agent-your-rules" className="text-foreground underline underline-offset-2">Setup Guide</Link>
              <Link href="/booa" className="text-foreground underline underline-offset-2">Download Agent Files</Link>
              <Link href="/bridge" className="text-foreground underline underline-offset-2">Register on ERC-8004</Link>
            </div>
          </div>

        </div>
      </main>
      <Footer />
    </div>
  );
}
