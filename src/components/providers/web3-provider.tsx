'use client';

import { useState } from 'react';
import { WagmiProvider } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RainbowKitProvider, darkTheme, lightTheme, type Theme } from '@rainbow-me/rainbowkit';
import { wagmiConfig } from '@/lib/wagmi';
import { useTheme } from '@/components/providers/theme-provider';
import { SiweProvider } from './siwe-provider';
import { shapeSepolia } from 'wagmi/chains';

import '@rainbow-me/rainbowkit/styles.css';

const fontFamily = 'var(--font-departure-mono), ui-monospace, monospace';

const booaDark: Theme = {
  ...darkTheme({ borderRadius: 'none', fontStack: 'system' }),
  colors: {
    ...darkTheme().colors,
    accentColor: '#ffffff',
    accentColorForeground: '#1a1a1a',
    connectButtonBackground: '#1a1a1a',
    connectButtonInnerBackground: '#1a1a1a',
    connectButtonText: '#ffffff',
    modalBackground: '#1a1a1a',
    modalBorder: '#333333',
    modalText: '#ffffff',
    modalTextSecondary: '#a3a3a3',
    modalTextDim: '#737373',
    profileForeground: '#1a1a1a',
    closeButton: '#a3a3a3',
    closeButtonBackground: '#333333',
    actionButtonBorder: '#333333',
    actionButtonBorderMobile: '#333333',
    actionButtonSecondaryBackground: '#262626',
    generalBorder: '#333333',
    generalBorderDim: '#262626',
    menuItemBackground: '#262626',
    selectedOptionBorder: '#ffffff',
    standby: '#fbbf24',
    error: '#ef4444',
    downloadBottomCardBackground: '#1a1a1a',
    downloadTopCardBackground: '#262626',
    connectionIndicator: '#22c55e',
  },
  fonts: {
    body: fontFamily,
  },
  radii: {
    actionButton: '0px',
    connectButton: '0px',
    menuButton: '0px',
    modal: '0px',
    modalMobile: '0px',
  },
  shadows: {
    connectButton: 'none',
    dialog: 'none',
    profileDetailsAction: 'none',
    selectedOption: 'none',
    selectedWallet: 'none',
    walletLogo: 'none',
  },
};

const booaLight: Theme = {
  ...lightTheme({ borderRadius: 'none', fontStack: 'system' }),
  colors: {
    ...lightTheme().colors,
    accentColor: '#333333',
    accentColorForeground: '#ffffff',
    connectButtonBackground: '#ffffff',
    connectButtonInnerBackground: '#ffffff',
    connectButtonText: '#1a1a1a',
    modalBackground: '#ffffff',
    modalBorder: '#d4d4d4',
    modalText: '#1a1a1a',
    modalTextSecondary: '#737373',
    modalTextDim: '#a3a3a3',
    profileForeground: '#ffffff',
    closeButton: '#737373',
    closeButtonBackground: '#f5f5f5',
    actionButtonBorder: '#d4d4d4',
    actionButtonBorderMobile: '#d4d4d4',
    actionButtonSecondaryBackground: '#f5f5f5',
    generalBorder: '#d4d4d4',
    generalBorderDim: '#e5e5e5',
    menuItemBackground: '#f5f5f5',
    selectedOptionBorder: '#333333',
    standby: '#eab308',
    error: '#ef4444',
    downloadBottomCardBackground: '#ffffff',
    downloadTopCardBackground: '#f5f5f5',
    connectionIndicator: '#22c55e',
  },
  fonts: {
    body: fontFamily,
  },
  radii: {
    actionButton: '0px',
    connectButton: '0px',
    menuButton: '0px',
    modal: '0px',
    modalMobile: '0px',
  },
  shadows: {
    connectButton: 'none',
    dialog: 'none',
    profileDetailsAction: 'none',
    selectedOption: 'none',
    selectedWallet: 'none',
    walletLogo: 'none',
  },
};

export function Web3Provider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const { theme } = useTheme();

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <SiweProvider>
          <RainbowKitProvider theme={theme === 'dark' ? booaDark : booaLight} initialChain={shapeSepolia}>
            {children}
          </RainbowKitProvider>
        </SiweProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
