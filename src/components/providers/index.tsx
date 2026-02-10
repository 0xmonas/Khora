'use client';

import dynamic from 'next/dynamic';
import { ThemeProvider } from './theme-provider';

const Web3Provider = dynamic(
  () => import('./web3-provider').then((mod) => mod.Web3Provider),
  { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <Web3Provider>
        {children}
      </Web3Provider>
    </ThemeProvider>
  );
}
