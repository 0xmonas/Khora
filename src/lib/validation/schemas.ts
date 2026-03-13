import { z } from 'zod';

// Block null bytes and ALL control characters (single-line input only)
const safeString = (max: number) =>
  z.string().trim().max(max).refine(
    (s) => !/[\x00-\x1F\x7F]/.test(s),
    'Contains invalid control characters',
  );

export const generateAgentSchema = z.object({
  name: safeString(100).pipe(z.string().min(1, 'Name is required')),
  description: safeString(1000).pipe(z.string().min(1, 'Description is required')),
});

export const fetchAgentSchema = z.object({
  chain: z.enum([
    // Mainnets
    'ethereum', 'base', 'shape', 'polygon', 'arbitrum',
    'optimism', 'avalanche', 'bsc', 'celo', 'gnosis',
    'scroll', 'linea', 'mantle', 'metis',
    'abstract', 'monad',
    // Testnets
    'base-sepolia', 'shape-sepolia',
  ]),
  agentId: z.number().int().positive('Agent ID must be a positive integer').max(100_000_000, 'Agent ID too large'),
});

export const enrichAgentSchema = z.object({
  name: safeString(100).pipe(z.string().min(1)),
  description: safeString(1000).pipe(z.string().min(1)),
  skills: z.array(safeString(100)).max(20).default([]),
  domains: z.array(safeString(100)).max(20).default([]),
});

export const discoverAgentsSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
});
