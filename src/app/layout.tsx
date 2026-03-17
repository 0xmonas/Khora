// /src/app/layout.tsx
import './globals.css';
import localFont from 'next/font/local';
import { Analytics } from '@vercel/analytics/next';
import { Providers } from '@/components/providers';

const departureMono = localFont({
  src: './fonts/DepartureMono-Regular.woff',
  variable: '--font-departure-mono',
});

export const metadata = {
  metadataBase: new URL('https://khora.fun'),
  title: 'Khôra',
  description: 'Open-source studio building tools for autonomous agents, generative NFTs, and on-chain games.',
  keywords: ['AI', 'agents', 'NFT', 'on-chain', 'ERC-8004', 'pixel art', 'Shape Network'],
  icons: {
    icon: '/favicon.ico',
  },
  openGraph: {
    title: 'Khôra',
    description: 'Open-source studio building tools for autonomous agents, generative NFTs, and on-chain games.',
    url: 'https://khora.fun',
    siteName: 'Khôra',
    images: [{ url: '/og-banner.png', width: 1200, height: 630 }],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Khôra',
    description: 'Open-source studio for autonomous agents, generative NFTs, and on-chain games.',
    images: ['/og-banner.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${departureMono.variable} font-mono min-h-screen flex flex-col`}>
        <Providers>{children}</Providers>
        <Analytics />
      </body>
    </html>
  );
}
