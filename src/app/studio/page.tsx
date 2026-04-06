'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ExternalLink } from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose,
} from '@/components/ui/dialog';

const font = { fontFamily: 'var(--font-departure-mono)' };

interface ToolCard {
  id: string;
  title: string;
  description: string;
  href: string;
  /** File path relative to /public/studio/ — supports .png, .jpg, .webp, .mp4 */
  media: string;
  tag?: string;
  /** External tool fields */
  external?: boolean;
  creator?: string;
  creatorUrl?: string;
  github?: string;
}

const TOOLS: ToolCard[] = [
  {
    id: 'ident-cards',
    title: 'Ident Cards',
    description: 'Look up any BOOA agent by token ID. View on-chain pixel art, traits, and ERC-8004 identity.',
    href: '/agents',
    media: 'ident.png',
    tag: 'LIVE',
  },
  {
    id: 'img2boa',
    title: 'Img2Booa',
    description: 'Turn any image into BOOA-style pixel art. Same C64 palette + Bayer dithering pipeline as the minter.',
    href: '/studio/img2boa',
    media: 'img2booa.png',
    tag: 'LIVE',
  },
  {
    id: 'agent-sound',
    title: 'Agent Sound',
    description: 'Each pixel becomes a note. 64 rows, 16 tones — hear your agent as 8-bit chiptune.',
    href: '/studio/agent-sound',
    media: 'agent-sound.png',
    tag: 'NEW',
  },
  {
    id: 'banner-builder',
    title: 'Banner Builder',
    description: 'Build a Twitter/X banner from your BOOA agents. Drag to reorder, export as PNG.',
    href: '/studio/banner-builder',
    media: 'banner-builder.png',
    tag: 'NEW',
  },
  {
    id: 'agent-chat',
    title: 'Agent Chat',
    description: 'Talk to your BOOA agents. Each agent responds in character based on its personality and expertise.',
    href: '/studio/agent-chat',
    media: 'agent-chat.png',
    tag: 'NEW',
  },
  {
    id: 'inner-circle',
    title: 'Inner Circle',
    description: 'Exclusive X group chat for BOOA holders. Hold 3+ BOOAs to join.',
    href: '/studio/inner-circle',
    media: 'inner-circle.gif',
    tag: 'NEW',
  },
  {
    id: 'persona-quiz',
    title: 'Persona Quiz',
    description: 'Answer 7 questions and find your BOOA match among 3,333 agents.',
    href: '/studio/persona-quiz',
    media: 'persona-quiz.png',
    tag: 'NEW',
  },
  {
    id: 'agent-layers',
    title: 'Agent Layers',
    description: 'Explore the 4 layers of a BOOA agent — from on-chain data to autonomous runtime.',
    href: '/studio/agent-layers',
    media: 'agent-layer.png',
    tag: 'NEW',
  },
  {
    id: 'pixel-forge',
    title: 'Pixel Forge',
    description: 'Import your BOOA, draw over it, generate new assets with AI. Same palette, your creativity.',
    href: '/studio/pixel-forge',
    media: 'pixel-forge.png',
    tag: 'NEW',
  },
  {
    id: 'booas-wanted',
    title: 'BOOAS WANTED',
    description: 'Turn any BOOA into a pixel-style "WANTED" poster. Load by token ID, edit text, export as PNG. CC0.',
    href: 'https://booas-wanted.vercel.app',
    media: 'booas-wanted.jpeg',
    external: true,
    creator: '@0xfilter8',
    creatorUrl: 'https://x.com/0xfilter8',
    github: 'https://github.com/FILTER8/booas-wanted',
  },
];

function isVideo(filename: string) {
  return filename.endsWith('.mp4');
}

function ToolMedia({ src, alt, priority }: { src: string; alt: string; priority?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const path = `/studio/${src}`;

  if (isVideo(src)) {
    return (
      <video
        ref={videoRef}
        src={path}
        muted
        loop
        playsInline
        autoPlay
        className="w-full h-full object-cover"
      />
    );
  }

  return (
    <Image
      src={path}
      alt={alt}
      fill
      priority={priority}
      unoptimized={src.endsWith('.gif')}
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      className="object-cover"
      style={{ imageRendering: src.endsWith('.png') ? 'pixelated' : 'auto' }}
    />
  );
}

function InternalToolCard({ tool }: { tool: ToolCard }) {
  return (
    <Link
      href={tool.href}
      className="group border-2 border-neutral-700 dark:border-neutral-200 flex flex-col transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.02]"
    >
      <div className="relative w-full aspect-video overflow-hidden bg-neutral-100 dark:bg-neutral-800">
        <ToolMedia src={tool.media} alt={tool.title} priority={tool.id === TOOLS[0]?.id} />
        {tool.tag && (
          <span
            className="absolute top-2 right-2 text-[9px] uppercase tracking-wider px-1.5 py-0.5 border border-green-600 dark:border-green-500 text-green-600 dark:text-green-500 bg-white/90 dark:bg-neutral-900/90"
            style={font}
          >
            {tool.tag}
          </span>
        )}
      </div>
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="space-y-1.5">
          <h3 className="text-sm text-foreground" style={font}>{tool.title}</h3>
          <p className="text-xs text-muted-foreground leading-relaxed" style={font}>{tool.description}</p>
        </div>
        <div className="mt-auto flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors" style={font}>
          Open
          <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
}

function ExternalToolCard({ tool }: { tool: ToolCard }) {
  const [showModal, setShowModal] = useState(false);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="group border-2 border-neutral-700 dark:border-neutral-200 flex flex-col transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.02] text-left w-full"
      >
        <div className="relative w-full aspect-video overflow-hidden bg-neutral-100 dark:bg-neutral-800">
          <ToolMedia src={tool.media} alt={tool.title} />
          <span
            className="absolute top-2 right-2 text-[9px] uppercase tracking-wider px-1.5 py-0.5 border border-amber-600 dark:border-amber-500 text-amber-600 dark:text-amber-500 bg-white/90 dark:bg-neutral-900/90"
            style={font}
          >
            Community
          </span>
        </div>
        <div className="p-4 flex flex-col gap-3 flex-1">
          <div className="space-y-1.5">
            <h3 className="text-sm text-foreground flex items-center gap-1.5" style={font}>
              {tool.title}
              <ExternalLink className="w-3 h-3 text-muted-foreground/50" />
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed" style={font}>{tool.description}</p>
          </div>
          {tool.creator && (
            <p className="text-[10px] text-muted-foreground/40" style={font}>by {tool.creator}</p>
          )}
          <div className="mt-auto flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors" style={font}>
            Open
            <ExternalLink className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
          </div>
        </div>
      </button>

      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle style={font}>Leaving Khora</DialogTitle>
            <DialogClose className="text-muted-foreground hover:text-foreground" />
          </DialogHeader>

          <div className="p-4 space-y-4">
            <p className="text-xs text-muted-foreground leading-relaxed" style={font}>
              You are about to visit an external tool built by a community developer. This tool is not maintained or audited by the Khora team.
            </p>

            <div className="space-y-2 text-[10px]" style={font}>
              <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-neutral-800">
                <span className="text-muted-foreground">Tool</span>
                <span className="text-foreground">{tool.title}</span>
              </div>
              {tool.creator && (
                <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-neutral-800">
                  <span className="text-muted-foreground">Creator</span>
                  {tool.creatorUrl ? (
                    <a href={tool.creatorUrl} target="_blank" rel="noopener noreferrer" className="text-foreground hover:underline">{tool.creator}</a>
                  ) : (
                    <span className="text-foreground">{tool.creator}</span>
                  )}
                </div>
              )}
              {tool.github && (
                <div className="flex justify-between py-1 border-b border-neutral-100 dark:border-neutral-800">
                  <span className="text-muted-foreground">Source</span>
                  <a href={tool.github} target="_blank" rel="noopener noreferrer" className="text-foreground hover:underline">{tool.github.replace('https://github.com/', '')}</a>
                </div>
              )}
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">URL</span>
                <span className="text-foreground">{tool.href.replace('https://', '')}</span>
              </div>
            </div>

            <p className="text-[9px] text-muted-foreground/40" style={font}>
              Please do your own research before connecting your wallet or sharing any data.
            </p>

            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 h-9 border-2 border-neutral-700 dark:border-neutral-200 text-[10px] uppercase hover:bg-foreground/5 transition-colors"
                style={font}
              >
                Go Back
              </button>
              <a
                href={tool.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setShowModal(false)}
                className="flex-1 h-9 flex items-center justify-center gap-1.5 border-2 border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900 text-[10px] uppercase hover:bg-neutral-600 dark:hover:bg-neutral-300 transition-colors"
                style={font}
              >
                Continue
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ToolCardItem({ tool }: { tool: ToolCard }) {
  if (tool.external) return <ExternalToolCard tool={tool} />;
  return <InternalToolCard tool={tool} />;
}

export default function StudioPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="p-4 md:p-8 lg:p-12">
          <div className="w-full lg:grid lg:grid-cols-12">
            <div className="hidden lg:block lg:col-span-1" />
            <div className="lg:col-span-10">
              {/* Title */}
              <div className="max-w-2xl space-y-3">
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest" style={font}>
                  BOOA
                </p>
                <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>
                  Studio
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-lg" style={font}>
                  Tools and utilities for the BOOA collection.
                </p>
              </div>

              {/* Tool Grid */}
              <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {TOOLS.map((tool) => (
                  <ToolCardItem key={tool.id} tool={tool} />
                ))}
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
