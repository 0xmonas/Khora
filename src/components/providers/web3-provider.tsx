'use client';

import { useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme, lightTheme } from '@rainbow-me/rainbowkit';
import { wagmiConfig } from '@/lib/wagmi';
import { useTheme } from '@/components/providers/theme-provider';
import { SiweProvider } from './siwe-provider';

import '@rainbow-me/rainbowkit/styles.css';

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const { theme } = useTheme();

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SiweProvider>
          <RainbowKitProvider
            theme={theme === 'dark' ? darkTheme({
              accentColor: '#ffffff',
              accentColorForeground: '#1a1a1a',
              borderRadius: 'none',
              fontStack: 'system',
            }) : lightTheme({
              accentColor: '#333333',
              accentColorForeground: '#ffffff',
              borderRadius: 'none',
              fontStack: 'system',
            })}
          >
            {children}
          </RainbowKitProvider>
        </SiweProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
