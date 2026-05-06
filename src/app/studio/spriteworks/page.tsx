import type { Metadata } from 'next';
import { SpriteworksClient } from './SpriteworksClient';
import { Footer } from '@/components/layouts/Footer';
import { Header } from '@/components/layouts/Header';
import { HolderGate } from '@/components/features/studio/HolderGate';

export const metadata: Metadata = {
  title: 'Spriteworks',
  description: 'Generate game-ready BOOA sprite sheets via Gemini, OpenAI, or Replicate (BYOK).',
};

export default function SpriteworksPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <HolderGate>
          <SpriteworksClient />
        </HolderGate>
      </main>
      <Footer />
    </div>
  );
}
