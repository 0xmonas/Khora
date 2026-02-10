import { SupportedChain } from '@/types/agent';

export interface GenerateAgentRequest {
  name: string;
  description: string;
}

export interface FetchAgentRequest {
  chain: SupportedChain;
  agentId: number;
}

export interface EnrichAgentRequest {
  name: string;
  description: string;
  skills: string[];
  domains: string[];
}

export interface GenerateImageRequest {
  prompt: string;
}

export interface GeneratePromptRequest {
  prompt: string;
}
