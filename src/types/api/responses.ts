import { BooaAgent, ERC8004Registration } from '@/types/agent';

export interface ApiResponse<T> {
  data?: T;
  error?: string;
}

export interface GenerateAgentResponse {
  agent: Omit<BooaAgent, 'image'>;
}

export interface GenerateImageResponse {
  image: string;
}

export interface GeneratePromptResponse {
  prompt: string;
}

export interface FetchAgentResponse {
  registration: ERC8004Registration;
}

export interface EnrichAgentResponse {
  agent: Omit<BooaAgent, 'image'>;
}
