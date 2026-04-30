// /src/app/layout.tsx
import './globals.css';
import localFont from 'next/font/local';
import { Analytics } from '@vercel/analytics/next';
import { Providers } from '@/components/providers';

const departureMono = localFont({
  src: './fonts/DepartureMono-Regular.woff',
  variable: '--font-departure-mono',
});

const c64Pro = localFont({
  src: './fonts/C64_Pro_Mono.woff2',
  variable: '--font-c64',
});

export const metadata = {
  metadataBase: new URL('https://booa.app'),
  title: 'BOOA',
  description: 'Open-source studio building tools for autonomous agents, generative NFTs, and on-chain games.',
  keywords: ['AI', 'agents', 'NFT', 'on-chain', 'ERC-8004', 'pixel art', 'Shape Network'],
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-32.png', type: 'image/png', sizes: '32x32' },
      { url: '/icon-16.png', type: 'image/png', sizes: '16x16' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'BOOA',
    description: 'Open-source studio building tools for autonomous agents, generative NFTs, and on-chain games.',
    url: 'https://booa.app',
    siteName: 'BOOA',
    images: [{ url: '/og-banner.png', width: 1200, height: 630 }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'BOOA',
    description: 'Open-source studio for autonomous agents, generative NFTs, and on-chain games.',
    images: ['/og-banner.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${departureMono.variable} ${c64Pro.variable} font-mono min-h-screen flex flex-col`}>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
