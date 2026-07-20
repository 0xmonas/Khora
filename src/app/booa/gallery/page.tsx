'use client';
import { GeneratorProvider } from '@/components/features/generator';
import { CollectionPage } from '@/components/features/generator/CollectionPage';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';

export default function BOOACollectionRoute() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <GeneratorProvider>
          <CollectionPage />
        </GeneratorProvider>
      </main>
      <Footer />
    </div>
  );
}
