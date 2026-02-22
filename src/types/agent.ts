// Unified agent data model — compatible with OpenClaw + ERC-8004
export interface KhoraAgent {
  name: string;
  description: string;
  creature: string;
  vibe: string;
  emoji: string;
  personality: string[];
  boundaries: string[];
  skills: string[];
  domains: string[];
  services: AgentService[];
  image: string; // base64 data URI (pixel art PFP)
  // ERC-8004 registration config (user-provided, optional)
  x402Support?: boolean;
  supportedTrust?: string[];
}

export interface AgentService {
  name: string;
  endpoint: string;
  version?: string;
  skills?: string[];
  domains?: string[];
}

// ERC-8004 Registration File (off-chain JSON pointed to by agentURI)
export interface ERC8004Registration {
  type: 'https://eips.ethereum.org/EIPS/eip-8004#registration-v1';
  name: string;
  description: string;
  image: string;
  services: AgentService[];
  active: boolean;
  x402Support?: boolean;
  registrations?: { agentId: number; agentRegistry: string }[];
  supportedTrust?: string[];
  updatedAt?: number;
}

// Supported chains for ERC-8004 Identity Registry
export type SupportedChain =
  | 'ethereum' | 'base' | 'base-sepolia' | 'polygon' | 'arbitrum'
  | 'celo' | 'gnosis' | 'scroll' | 'taiko' | 'bsc';

export interface ChainInfo {
  chainId: number;
  name: string;
  rpcUrl: string;
  rpcUrls: string[]; // primary + fallback RPCs
}

export const CHAIN_CONFIG: Record<SupportedChain, ChainInfo> = {
  ethereum: { chainId: 1, name: 'Ethereum', rpcUrl: 'https://ethereum-rpc.publicnode.com', rpcUrls: ['https://ethereum-rpc.publicnode.com', 'https://rpc.ankr.com/eth', 'https://1rpc.io/eth'] },
  base: { chainId: 8453, name: 'Base', rpcUrl: 'https://base-rpc.publicnode.com', rpcUrls: ['https://base-rpc.publicnode.com', 'https://mainnet.base.org', 'https://1rpc.io/base'] },
  'base-sepolia': { chainId: 84532, name: 'Base Sepolia', rpcUrl: 'https://sepolia.base.org', rpcUrls: ['https://sepolia.base.org', 'https://base-sepolia-rpc.publicnode.com'] },
  polygon: { chainId: 137, name: 'Polygon', rpcUrl: 'https://1rpc.io/matic', rpcUrls: ['https://1rpc.io/matic', 'https://polygon-bor-rpc.publicnode.com', 'https://rpc.ankr.com/polygon'] },
  arbitrum: { chainId: 42161, name: 'Arbitrum', rpcUrl: 'https://arbitrum-one-rpc.publicnode.com', rpcUrls: ['https://arbitrum-one-rpc.publicnode.com', 'https://arb1.arbitrum.io/rpc', 'https://1rpc.io/arb'] },
  celo: { chainId: 42220, name: 'Celo', rpcUrl: 'https://celo-rpc.publicnode.com', rpcUrls: ['https://celo-rpc.publicnode.com', 'https://1rpc.io/celo', 'https://rpc.ankr.com/celo'] },
  gnosis: { chainId: 100, name: 'Gnosis', rpcUrl: 'https://rpc.gnosischain.com', rpcUrls: ['https://rpc.gnosischain.com', 'https://gnosis-rpc.publicnode.com', 'https://1rpc.io/gnosis'] },
  scroll: { chainId: 534352, name: 'Scroll', rpcUrl: 'https://scroll-rpc.publicnode.com', rpcUrls: ['https://scroll-rpc.publicnode.com', 'https://rpc.scroll.io', 'https://1rpc.io/scroll'] },
  taiko: { chainId: 167000, name: 'Taiko', rpcUrl: 'https://rpc.taiko.xyz', rpcUrls: ['https://rpc.taiko.xyz', 'https://taiko-rpc.publicnode.com', 'https://rpc.mainnet.taiko.xyz'] },
  bsc: { chainId: 56, name: 'BNB Chain', rpcUrl: 'https://bsc-rpc.publicnode.com', rpcUrls: ['https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.binance.org', 'https://1rpc.io/bnb'] },
};

// Deterministic deployment address (CREATE2) — same on all chains
export const IDENTITY_REGISTRY_ADDRESS = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;

// Discovered agent from on-chain registry scan
export interface DiscoveredAgent {
  chain: SupportedChain;
  chainName: string;
  tokenId: number;
  name: string | null;
  hasMetadata: boolean;
}
