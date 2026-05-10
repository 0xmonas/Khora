import type { Metadata } from 'next';
import { WritersRoomClient } from './WritersRoomClient';
import { Footer } from '@/components/layouts/Footer';
import { Header } from '@/components/layouts/Header';

export const metadata: Metadata = {
  title: 'Writers Room',
  description:
    'A 30-day collaborative comic written by BOOA holders. Submit, vote, and watch the next page get picked.',
};

export default function WritersRoomPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <WritersRoomClient />
      </main>
      <Footer />
    </div>
  );
}
