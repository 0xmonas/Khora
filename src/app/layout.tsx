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
  title: 'Khôra',
  description: 'AI-powered character generator',
  keywords: ['AI', 'character', 'generator', 'Claude', 'Replicate'],
  icons: {
    icon: '/favicon.ico',
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
