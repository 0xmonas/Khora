'use client';

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { base, baseSepolia } from 'wagmi/chains';
import { http } from 'wagmi';

const alchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;

export const wagmiConfig = getDefaultConfig({
  appName: 'Khora Agent',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'placeholder',
  chains: [base, baseSepolia],
  ssr: true,
  transports: alchemyKey
    ? {
        [base.id]: http(`https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`),
        [baseSepolia.id]: http(`https://base-sepolia.g.alchemy.com/v2/${alchemyKey}`),
      }
    : undefined,
});
