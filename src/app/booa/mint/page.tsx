// /src/app/booa/mint/page.tsx
'use client';
import { GeneratorPage, GeneratorProvider } from '@/components/features/generator';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';

export default function BOOAMintRoute() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <GeneratorProvider>
          <GeneratorPage />
        </GeneratorProvider>
      </main>
      <Footer />
    </div>
  );
}
