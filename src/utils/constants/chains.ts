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
