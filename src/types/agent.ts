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
  registrations?: { agentId?: number; agentRegistry: string }[];
  supportedTrust?: string[];
  updatedAt?: number;
  // Links this 8004 agent to its source NFT (immutable in Registered event log)
  nftOrigin?: {
    contract: string;  // CAIP-10 format: eip155:{chainId}:{address}
    tokenId: number;
    originalOwner: string; // wallet that registered (lowercase)
  };
}

// Supported chains for ERC-8004 Identity Registry (Alchemy-supported only)
export type SupportedChain =
  // Mainnets
  | 'ethereum' | 'base' | 'shape' | 'polygon' | 'arbitrum'
  | 'optimism' | 'avalanche' | 'bsc' | 'celo' | 'gnosis'
  | 'scroll' | 'linea' | 'mantle' | 'metis'
  | 'abstract' | 'monad'
  // Testnets
  | 'base-sepolia' | 'shape-sepolia';

export interface ChainInfo {
  chainId: number;
  name: string;
  rpcUrl: string;
  rpcUrls: string[]; // primary + fallback RPCs
}

export const CHAIN_CONFIG: Record<SupportedChain, ChainInfo> = {
  // ─── Mainnets ───
  ethereum: { chainId: 1, name: 'Ethereum', rpcUrl: 'https://ethereum-rpc.publicnode.com', rpcUrls: ['https://ethereum-rpc.publicnode.com', 'https://rpc.ankr.com/eth', 'https://1rpc.io/eth'] },
  base: { chainId: 8453, name: 'Base', rpcUrl: 'https://mainnet.base.org', rpcUrls: ['https://mainnet.base.org', 'https://base-rpc.publicnode.com', 'https://1rpc.io/base'] },
  shape: { chainId: 360, name: 'Shape', rpcUrl: 'https://mainnet.shape.network', rpcUrls: ['https://mainnet.shape.network'] },
  polygon: { chainId: 137, name: 'Polygon', rpcUrl: 'https://1rpc.io/matic', rpcUrls: ['https://1rpc.io/matic', 'https://polygon-bor-rpc.publicnode.com', 'https://rpc.ankr.com/polygon'] },
  arbitrum: { chainId: 42161, name: 'Arbitrum', rpcUrl: 'https://arbitrum-one-rpc.publicnode.com', rpcUrls: ['https://arbitrum-one-rpc.publicnode.com', 'https://arb1.arbitrum.io/rpc', 'https://1rpc.io/arb'] },
  optimism: { chainId: 10, name: 'OP Mainnet', rpcUrl: 'https://mainnet.optimism.io', rpcUrls: ['https://mainnet.optimism.io', 'https://optimism-rpc.publicnode.com'] },
  avalanche: { chainId: 43114, name: 'Avalanche', rpcUrl: 'https://api.avax.network/ext/bc/C/rpc', rpcUrls: ['https://api.avax.network/ext/bc/C/rpc', 'https://avalanche-c-chain-rpc.publicnode.com'] },
  bsc: { chainId: 56, name: 'BNB Chain', rpcUrl: 'https://bsc-rpc.publicnode.com', rpcUrls: ['https://bsc-rpc.publicnode.com', 'https://bsc-dataseed.binance.org', 'https://1rpc.io/bnb'] },
  celo: { chainId: 42220, name: 'Celo', rpcUrl: 'https://celo-rpc.publicnode.com', rpcUrls: ['https://celo-rpc.publicnode.com', 'https://1rpc.io/celo', 'https://rpc.ankr.com/celo'] },
  gnosis: { chainId: 100, name: 'Gnosis', rpcUrl: 'https://rpc.gnosischain.com', rpcUrls: ['https://rpc.gnosischain.com', 'https://gnosis-rpc.publicnode.com', 'https://1rpc.io/gnosis'] },
  scroll: { chainId: 534352, name: 'Scroll', rpcUrl: 'https://scroll-rpc.publicnode.com', rpcUrls: ['https://scroll-rpc.publicnode.com', 'https://rpc.scroll.io', 'https://1rpc.io/scroll'] },
  linea: { chainId: 59144, name: 'Linea', rpcUrl: 'https://rpc.linea.build', rpcUrls: ['https://rpc.linea.build', 'https://linea-mainnet-rpc.publicnode.com'] },
  mantle: { chainId: 5000, name: 'Mantle', rpcUrl: 'https://rpc.mantle.xyz', rpcUrls: ['https://rpc.mantle.xyz', 'https://mantle-rpc.publicnode.com'] },
  metis: { chainId: 1088, name: 'Metis', rpcUrl: 'https://andromeda.metis.io/?owner=1088', rpcUrls: ['https://andromeda.metis.io/?owner=1088', 'https://metis-mainnet.public.blastapi.io'] },
  abstract: { chainId: 2741, name: 'Abstract', rpcUrl: 'https://api.mainnet.abs.xyz', rpcUrls: ['https://api.mainnet.abs.xyz'] },
  monad: { chainId: 143, name: 'Monad', rpcUrl: 'https://rpc.monad.xyz', rpcUrls: ['https://rpc.monad.xyz', 'https://monad-mainnet.drpc.org'] },
  // ─── Testnets ───
  'base-sepolia': { chainId: 84532, name: 'Base Sepolia', rpcUrl: 'https://sepolia.base.org', rpcUrls: ['https://sepolia.base.org', 'https://base-sepolia-rpc.publicnode.com'] },
  'shape-sepolia': { chainId: 11011, name: 'Shape Sepolia', rpcUrl: 'https://sepolia.shape.network', rpcUrls: ['https://sepolia.shape.network'] },
};

// Deterministic deployment address (CREATE2) — same on all chains
export const IDENTITY_REGISTRY_ADDRESS = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;

// Discovered agent from on-chain registry scan
export interface DiscoveredAgent {
  chain: SupportedChain;
  chainName: string;
  tokenId: number;
  name: string | null;
  image: string | null;
  description: string | null;
  hasMetadata: boolean;
}
