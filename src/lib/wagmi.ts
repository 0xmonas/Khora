'use client';

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { shape, shapeSepolia } from 'wagmi/chains';
import { http } from 'wagmi';

export const wagmiConfig = getDefaultConfig({
  appName: 'Khora Agent',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'placeholder',
  chains: [shape, shapeSepolia],
  ssr: true,
  transports: {
    [shape.id]: http('https://mainnet.shape.network'),
    [shapeSepolia.id]: http('https://sepolia.shape.network'),
  },
});
