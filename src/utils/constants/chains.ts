import { CHAIN_CONFIG, type SupportedChain } from '@/types/agent';

/**
 * Hide testnet chains in production UI.
 * Set NEXT_PUBLIC_HIDE_TESTNETS=true on Vercel.
 * Local dev: don't set it → testnets visible.
 */
export const HIDE_TESTNETS = process.env.NEXT_PUBLIC_HIDE_TESTNETS === 'true';

const TESTNET_KEYS = new Set<SupportedChain>(['base-sepolia', 'shape-sepolia']);

export function isTestnetChain(chain: SupportedChain): boolean {
  return TESTNET_KEYS.has(chain);
}

/** All chains visible to the user (filtered in production) */
export const VISIBLE_CHAINS: SupportedChain[] = (Object.keys(CHAIN_CONFIG) as SupportedChain[])
  .filter(key => !HIDE_TESTNETS || !isTestnetChain(key));

/** Dropdown options for chain selectors (filtered in production) */
export const VISIBLE_CHAIN_OPTIONS: { value: SupportedChain; label: string }[] =
  VISIBLE_CHAINS.map(key => ({ value: key, label: CHAIN_CONFIG[key].name }));

/** Display name + logo per chainId — shared by the landing stats and the header. */
export interface ChainMeta { name: string; chainId: number; logo: string }
export const CHAIN_META: ChainMeta[] = [
  { name: 'Ethereum', chainId: 1, logo: '/chains/ethereum.png' },
  { name: 'Base', chainId: 8453, logo: '/chains/base.png' },
  { name: 'Shape', chainId: 360, logo: '/chains/shape.png' },
  { name: 'Polygon', chainId: 137, logo: '/chains/polygon.png' },
  { name: 'Arbitrum', chainId: 42161, logo: '/chains/arbitrum.png' },
  { name: 'OP Mainnet', chainId: 10, logo: '/chains/optimism.png' },
  { name: 'Avalanche', chainId: 43114, logo: '/chains/avalanche.png' },
  { name: 'BNB Chain', chainId: 56, logo: '/chains/bnb.png' },
  { name: 'Celo', chainId: 42220, logo: '/chains/celo.png' },
  { name: 'Gnosis', chainId: 100, logo: '/chains/gnosis.png' },
  { name: 'Scroll', chainId: 534352, logo: '/chains/scroll.png' },
  { name: 'Linea', chainId: 59144, logo: '/chains/linea.png' },
  { name: 'Mantle', chainId: 5000, logo: '/chains/mantle.png' },
  { name: 'Metis', chainId: 1088, logo: '/chains/metis.png' },
  { name: 'Abstract', chainId: 2741, logo: '/chains/abstract.png' },
  { name: 'Monad', chainId: 143, logo: '/chains/monad.png' },
  { name: 'Robinhood Chain', chainId: 4663, logo: '/chains/robinhood.png' },
  { name: 'Shape Sepolia', chainId: 11011, logo: '/chains/shape.png' },
];

export function getChainMeta(chainId: number): ChainMeta | null {
  return CHAIN_META.find(c => c.chainId === chainId) ?? null;
}
