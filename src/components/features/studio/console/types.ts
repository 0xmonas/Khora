export interface ConsoleMeta {
  template_version: string;
  hermes_version: string | null;
  hermes_pin: string;
  token_id: number | null;
  chain_id: number;
  agent_name: string;
  gateway: { running: boolean; uptime: number };
  console: { enabled: boolean };
}

export interface ConsoleSession {
  id: string;
  title?: string | null;
  created_at?: string | number | null;
  updated_at?: string | number | null;
}

export interface ConsoleMessage {
  id?: string;
  role: string;
  content: unknown;
  tool_name?: string | null;
  timestamp?: string | number | null;
}

export interface ConsoleAgent {
  tokenId: number;
  name: string;
  image: string;
  agentId: number | null;
  bound: boolean | null;
  controller: string | null;
  agentWallet: string | null;
}

export function extractText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => {
        if (typeof c === 'string') return c;
        if (c && typeof c === 'object' && 'text' in c) return String((c as { text?: unknown }).text ?? '');
        return '';
      })
      .join('');
  }
  return '';
}
