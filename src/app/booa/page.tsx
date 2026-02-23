// /src/app/booa/page.tsx
'use client';
import { BOOAHeroSection } from '@/components/layouts/BOOAHeroSection';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';

export default function BOOAPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <BOOAHeroSection />
      </main>
      <Footer />
    </div>
  );
}
