'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { AgentConsole } from '@/components/features/studio/console/AgentConsole';
import { HolderGate } from '@/components/features/studio/HolderGate';

const font = { fontFamily: 'var(--font-departure-mono)' };

export default function AgentConsolePage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="p-4 md:p-8 lg:p-12">
          <div className="w-full lg:grid lg:grid-cols-12">
            <div className="hidden lg:block lg:col-span-1" />
            <div className="lg:col-span-10">
              <div className="space-y-3 mb-6">
                <Link
                  href="/studio"
                  className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                  style={font}
                >
                  <ArrowLeft className="w-3 h-3" />
                  Studio
                </Link>
                <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>
                  Agent Console
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-lg" style={font}>
                  Chat with and manage your self-hosted Hermes agent from the browser. It runs on your
                  machine, not ours — booa.app stores nothing.
                </p>
              </div>

              <HolderGate toolName="Agent Console">
                <AgentConsole />
              </HolderGate>
            </div>
            <div className="hidden lg:block lg:col-span-1" />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
