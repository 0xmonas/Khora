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
export type SupportedChain = 'ethereum' | 'base' | 'polygon' | 'arbitrum';

export const CHAIN_CONFIG: Record<SupportedChain, { chainId: number; name: string; rpcUrl: string }> = {
  ethereum: { chainId: 1, name: 'Ethereum', rpcUrl: 'https://eth.llamarpc.com' },
  base: { chainId: 8453, name: 'Base', rpcUrl: 'https://base.llamarpc.com' },
  polygon: { chainId: 137, name: 'Polygon', rpcUrl: 'https://polygon.llamarpc.com' },
  arbitrum: { chainId: 42161, name: 'Arbitrum', rpcUrl: 'https://arbitrum.llamarpc.com' },
};

// Same address on all chains (deterministic deployment)
export const IDENTITY_REGISTRY_ADDRESS = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;
