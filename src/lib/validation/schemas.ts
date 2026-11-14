import { z } from 'zod';

export const fetchAgentSchema = z.object({
  chain: z.enum([
    // Mainnets
    'ethereum', 'base', 'shape', 'polygon', 'arbitrum',
    'optimism', 'avalanche', 'bsc', 'celo', 'gnosis',
    'scroll', 'linea', 'mantle', 'metis',
    'abstract', 'monad', 'robinhood',
    // Testnets
    'base-sepolia', 'shape-sepolia', 'robinhood-testnet',
  ]),
  agentId: z.number().int().positive('Agent ID must be a positive integer').max(100_000_000, 'Agent ID too large'),
});

export const discoverAgentsSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
});
