'use client';

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { shape, shapeSepolia } from 'wagmi/chains';
import { http } from 'wagmi';
import { HIDE_TESTNETS } from '@/utils/constants/chains';

const chains = HIDE_TESTNETS
  ? [shape] as const
  : [shape, shapeSepolia] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const transports: Record<number, any> = {
  [shape.id]: http('https://mainnet.shape.network'),
  ...(!HIDE_TESTNETS && { [shapeSepolia.id]: http('https://sepolia.shape.network') }),
};

export const wagmiConfig = getDefaultConfig({
  appName: 'Khora Agent',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'placeholder',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chains: chains as any,
  ssr: true,
  transports,
});
