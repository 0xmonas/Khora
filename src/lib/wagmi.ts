'use client';

import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import {
  shape, shapeSepolia,
  mainnet, base, arbitrum, optimism, polygon,
  avalanche, bsc, celo, gnosis, scroll, linea, mantle, metis, abstract as abstractChain, monad,
} from 'wagmi/chains';
import { http } from 'wagmi';
import { HIDE_TESTNETS } from '@/utils/constants/chains';

// All mainnet chains for Bridge cross-chain registration
const mainnetChains = [
  shape, mainnet, base, arbitrum, optimism, polygon,
  avalanche, bsc, celo, gnosis, scroll, linea, mantle, metis, abstractChain, monad,
] as const;

const testnetChains = [shapeSepolia] as const;

const allChains = HIDE_TESTNETS
  ? [...mainnetChains]
  : [...mainnetChains, ...testnetChains];

// Build transports from CHAIN_CONFIG RPC URLs
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const transports: Record<number, any> = {
  [shape.id]: http('https://mainnet.shape.network'),
  [mainnet.id]: http('https://ethereum-rpc.publicnode.com'),
  [base.id]: http('https://mainnet.base.org'),
  [arbitrum.id]: http('https://arbitrum-one-rpc.publicnode.com'),
  [optimism.id]: http('https://mainnet.optimism.io'),
  [polygon.id]: http('https://1rpc.io/matic'),
  [avalanche.id]: http('https://api.avax.network/ext/bc/C/rpc'),
  [bsc.id]: http('https://bsc-rpc.publicnode.com'),
  [celo.id]: http('https://celo-rpc.publicnode.com'),
  [gnosis.id]: http('https://rpc.gnosischain.com'),
  [scroll.id]: http('https://scroll-rpc.publicnode.com'),
  [linea.id]: http('https://rpc.linea.build'),
  [mantle.id]: http('https://rpc.mantle.xyz'),
  [metis.id]: http('https://andromeda.metis.io/?owner=1088'),
  [abstractChain.id]: http('https://api.mainnet.abs.xyz'),
  [monad.id]: http('https://rpc.monad.xyz'),
};

// Add testnet transports only when not hidden
if (!HIDE_TESTNETS) {
  transports[shapeSepolia.id] = http('https://sepolia.shape.network');
}

export const wagmiConfig = getDefaultConfig({
  appName: 'BOOA',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || 'placeholder',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  chains: allChains as any,
  ssr: true,
  transports,
});
