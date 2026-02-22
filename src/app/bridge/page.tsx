'use client';

import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { BridgeProvider } from '@/components/features/bridge/BridgeContext';
import BridgePage from '@/components/features/bridge/BridgePage';

export default function BridgeRoute() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <BridgeProvider>
          <BridgePage />
        </BridgeProvider>
      </main>
      <Footer />
    </div>
  );
}
