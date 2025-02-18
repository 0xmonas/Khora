'use client';
import { PixelatePage, PixelateProvider } from '@/components/features/pixelate';
import { PixelateHeader } from '@/components/features/pixelate/components/Header';
import { Footer } from '@/components/layouts/Footer';

export default function PixelateRoute() {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <PixelateHeader />
        <main className="flex-1">
          <PixelateProvider>
            <PixelatePage />
          </PixelateProvider>
        </main>
        <Footer />
      </div>
    );
  } 