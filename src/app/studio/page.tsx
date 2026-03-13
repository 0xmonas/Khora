'use client';

import { useRef, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowRight, ImageIcon } from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';

const font = { fontFamily: 'var(--font-departure-mono)' };

interface ToolCard {
  id: string;
  title: string;
  description: string;
  href: string;
  /** File path relative to /public/studio/ — supports .png, .jpg, .webp, .mp4 */
  media: string;
  tag?: string;
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
];

function isVideo(filename: string) {
  return filename.endsWith('.mp4');
}

function ToolMedia({ src, alt }: { src: string; alt: string }) {
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
      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
      className="object-cover"
      style={{ imageRendering: src.endsWith('.png') ? 'pixelated' : 'auto' }}
    />
  );
}

function ToolCardItem({ tool }: { tool: ToolCard }) {
  return (
    <Link
      href={tool.href}
      className="group border-2 border-neutral-700 dark:border-neutral-200 flex flex-col transition-colors hover:bg-neutral-50 dark:hover:bg-white/[0.02]"
    >
      {/* Media */}
      <div className="relative w-full aspect-video overflow-hidden bg-neutral-100 dark:bg-neutral-800">
        <ToolMedia src={tool.media} alt={tool.title} />
        {tool.tag && (
          <span
            className="absolute top-2 right-2 text-[9px] uppercase tracking-wider px-1.5 py-0.5 border border-green-600 dark:border-green-500 text-green-600 dark:text-green-500 bg-white/90 dark:bg-neutral-900/90"
            style={font}
          >
            {tool.tag}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        <div className="space-y-1.5">
          <h3 className="text-sm text-foreground" style={font}>
            {tool.title}
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed" style={font}>
            {tool.description}
          </p>
        </div>

        <div className="mt-auto flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground group-hover:text-foreground transition-colors" style={font}>
          Open
          <ArrowRight className="w-3 h-3 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </Link>
  );
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
              <div className="max-w-3xl space-y-8">

                {/* Title */}
                <div className="space-y-3">
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {TOOLS.map((tool) => (
                    <ToolCardItem key={tool.id} tool={tool} />
                  ))}
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
