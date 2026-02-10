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
}

export interface AgentService {
  name: string;
  endpoint: string;
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
}

// Supported chains for ERC-8004 Identity Registry
export type SupportedChain =
  | 'ethereum' | 'polygon' | 'arbitrum'
  | 'celo' | 'gnosis' | 'scroll' | 'taiko' | 'bsc';

export interface ChainInfo {
  chainId: number;
  name: string;
  rpcUrl: string;
}

export const CHAIN_CONFIG: Record<SupportedChain, ChainInfo> = {
  ethereum: { chainId: 1, name: 'Ethereum', rpcUrl: 'https://eth.llamarpc.com' },
  polygon: { chainId: 137, name: 'Polygon', rpcUrl: 'https://polygon.llamarpc.com' },
  arbitrum: { chainId: 42161, name: 'Arbitrum', rpcUrl: 'https://arbitrum.llamarpc.com' },
  celo: { chainId: 42220, name: 'Celo', rpcUrl: 'https://forno.celo.org' },
  gnosis: { chainId: 100, name: 'Gnosis', rpcUrl: 'https://rpc.gnosischain.com' },
  scroll: { chainId: 534352, name: 'Scroll', rpcUrl: 'https://rpc.scroll.io' },
  taiko: { chainId: 167000, name: 'Taiko', rpcUrl: 'https://rpc.mainnet.taiko.xyz' },
  bsc: { chainId: 56, name: 'BNB Chain', rpcUrl: 'https://bsc-dataseed.binance.org' },
};

// Deterministic deployment address (CREATE2) — same on all chains
export const IDENTITY_REGISTRY_ADDRESS = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;
