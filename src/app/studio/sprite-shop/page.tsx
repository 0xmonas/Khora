import type { Metadata } from 'next';
import { SpriteShopClient } from './SpriteShopClient';
import { Footer } from '@/components/layouts/Footer';
import { Header } from '@/components/layouts/Header';
import { HolderGate } from '@/components/features/studio/HolderGate';

export const metadata: Metadata = {
  title: 'Sprite Shop',
  description: 'Generate game-ready BOOA sprite atlases via Gemini, OpenAI, or Replicate (BYOK).',
};

export default function SpriteShopPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <HolderGate>
          <SpriteShopClient />
        </HolderGate>
      </main>
      <Footer />
    </div>
  );
}
