export interface ConsoleMeta {
  template_version: string;
  hermes_version: string | null;
  hermes_pin: string;
  token_id: number | null;
  chain_id: number;
  agent_name: string;
  provider?: string;
  model?: string;
  skills?: string[];
  gateway: { running: boolean; uptime: number };
  console: { enabled: boolean };
}

export interface ConsoleSession {
  id: string;
  title?: string | null;
  started_at?: string | number | null;
  last_active?: string | number | null;
  message_count?: number | null;
}

function toDate(value: string | number | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const numeric = Number(value);
  if (!Number.isNaN(numeric) && value.trim() !== '') return toDate(numeric);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatWhen(value: string | number | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

/** Session titles default to the start time — a truncated session id tells you nothing. */
export function sessionLabel(s: ConsoleSession): string {
  if (s.title && s.title.trim()) return s.title.trim();
  const d = toDate(s.started_at) || toDate(s.last_active);
  if (d) {
    return d.toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }
  return `chat ${s.id.slice(0, 8)}`;
}

export interface OnchainSettings {
  BOOA_ONCHAIN_MCP?: string;
  BOOA_ONCHAIN_WRITES?: string;
  BOOA_MAX_TX_ETH?: string;
  BOOA_DAILY_CAP_ETH?: string;
  BOOA_SEND_ALLOWLIST?: string;
  BOOA_SWAP_TOKEN_ALLOWLIST?: string;
  BOOA_MAX_SLIPPAGE_BPS?: string;
  BOOA_OPENSEA_MCP?: string;
  BOOA_OPENSEA_REQUIRE_VERIFIED?: string;
}

export function isOn(value: string | undefined): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase());
}

export interface ConsoleJob {
  id: string;
  name?: string | null;
  schedule_display?: string | null;
  schedule?: string | null;
  state?: string | null;
  enabled?: boolean | null;
  next_run_at?: string | number | null;
  last_run_at?: string | number | null;
  prompt?: string | null;
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
