export interface BooaskMessage {
  role: 'user' | 'model';
  text: string;
}

export interface BooaskRequest {
  message: string;
  history?: BooaskMessage[];
}

export interface BooaskResponse {
  reply: string;
  toolCalls?: { name: string; args: Record<string, unknown> }[];
  error?: string;
}

export interface ToolDef {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string }>;
    required?: string[];
  };
}

export type ToolExecutor = (args: Record<string, unknown>) => Promise<unknown>;
