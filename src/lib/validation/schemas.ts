import { z } from 'zod';

export const generatePromptSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, 'Prompt is required')
    .max(5000, 'Prompt is too long (max 5000 characters)'),
  systemInstruction: z
    .string()
    .trim()
    .max(10000, 'System instruction is too long')
    .optional(),
});

export const generateImageSchema = z.object({
  prompt: z
    .string()
    .trim()
    .min(1, 'Prompt is required')
    .max(5000, 'Prompt is too long (max 5000 characters)'),
});

export const generateAgentSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name is too long'),
  description: z.string().trim().min(1, 'Description is required').max(1000, 'Description is too long'),
});

export const fetchAgentSchema = z.object({
  chain: z.enum([
    'ethereum', 'base', 'base-sepolia', 'polygon', 'arbitrum',
    'celo', 'gnosis', 'scroll', 'taiko', 'bsc',
  ]),
  agentId: z.number().int().positive('Agent ID must be a positive integer'),
});

export const enrichAgentSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1),
  skills: z.array(z.string()).default([]),
  domains: z.array(z.string()).default([]),
});

export const discoverAgentsSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address'),
});
