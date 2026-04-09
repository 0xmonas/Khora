import { getRedis } from './redis';

const BASE = 'https://8004scan.io/api/v1';
const TIMEOUT_MS = 6000;
const CACHE_TTL = 60; // seconds

const redis = getRedis();

export interface EightAgent {
  chainId: number;
  contractAddress: string;
  tokenId: string; // stringified — it's the 8004 agentId on that chain
  name: string | null;
  description: string | null;
  imageUrl: string | null;
  ownerAddress: string;
  ownerEns: string | null;
  isVerified: boolean;
  x402Supported: boolean;
  supportedProtocols: string[];
  isTestnet: boolean;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface EightAgentDetail extends EightAgent {
  agentWallet: string | null;
  creatorAddress: string | null;
  services: Array<Record<string, unknown>>;
  tags: string[];
  categories: string[];
  scores: Record<string, unknown> | null;
  totalScore: number;
  ens: string | null;
  did: string | null;
  mcpServer: string | null;
  a2aEndpoint: string | null;
  agentUrl: string | null;
  rawAgentUri: string | null;
}

interface RawListItem {
  chain_id?: unknown;
  contract_address?: unknown;
  token_id?: unknown;
  name?: unknown;
  description?: unknown;
  image_url?: unknown;
  owner_address?: unknown;
  owner_ens?: unknown;
  is_verified?: unknown;
  x402_supported?: unknown;
  supported_protocols?: unknown;
  is_testnet?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}

interface RawListResponse {
  items?: unknown;
  total?: unknown;
  limit?: unknown;
  offset?: unknown;
}

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null;
}

function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function asBool(v: unknown): boolean {
  return v === true;
}

function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function parseListItem(raw: RawListItem): EightAgent | null {
  const chainId = asNumber(raw.chain_id);
  const contract = asString(raw.contract_address);
  const tokenId = asString(raw.token_id);
  const owner = asString(raw.owner_address);
  if (chainId === null || !contract || !tokenId || !owner) return null;

  return {
    chainId,
    contractAddress: contract.toLowerCase(),
    tokenId,
    name: asString(raw.name),
    description: asString(raw.description),
    imageUrl: asString(raw.image_url),
    ownerAddress: owner.toLowerCase(),
    ownerEns: asString(raw.owner_ens),
    isVerified: asBool(raw.is_verified),
    x402Supported: asBool(raw.x402_supported),
    supportedProtocols: asStringArray(raw.supported_protocols),
    isTestnet: asBool(raw.is_testnet),
    createdAt: asString(raw.created_at),
    updatedAt: asString(raw.updated_at),
  };
}

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`8004scan HTTP ${res.status}`);
  }
  return res.json();
}

function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  return work(ctrl.signal).finally(() => clearTimeout(timer));
}

export async function getAgentsByOwner(address: string): Promise<EightAgent[]> {
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return [];
  const addr = address.toLowerCase();

  const cacheKey = `eight004scan:owner:${addr}`;
  const cached = await redis.get<EightAgent[]>(cacheKey);
  if (cached) return cached;

  try {
    const url = `${BASE}/agents?owner_address=${addr}&limit=100`;
    const data = await withTimeout((signal) => fetchJson(url, signal)) as RawListResponse;

    if (!data || typeof data !== 'object') return [];
    const items = Array.isArray(data.items) ? data.items : [];
    const total = asNumber(data.total) ?? 0;

    if (total > 1000) {
      console.warn(`[8004scan] owner filter appears ignored (total=${total}), bailing out`);
      return [];
    }

    const parsed = items
      .map((i) => parseListItem(i as RawListItem))
      .filter((x): x is EightAgent => x !== null);

    await redis.set(cacheKey, parsed, { ex: CACHE_TTL });
    return parsed;
  } catch (err) {
    console.warn('[8004scan] getAgentsByOwner failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

export async function getAgentDetail(
  chainId: number,
  contractAddress: string,
  tokenId: number | string,
): Promise<EightAgentDetail | null> {
  if (!Number.isInteger(chainId)) return null;
  if (!/^0x[0-9a-fA-F]{40}$/.test(contractAddress)) return null;

  const contract = contractAddress.toLowerCase();
  const cacheKey = `eight004scan:detail:${chainId}:${contract}:${tokenId}`;
  const cached = await redis.get<EightAgentDetail>(cacheKey);
  if (cached) return cached;

  try {
    const url = `${BASE}/agents/${chainId}/${contract}/${tokenId}`;
    const data = await withTimeout((signal) => fetchJson(url, signal)) as Record<string, unknown>;

    if (!data || typeof data !== 'object') return null;

    const base = parseListItem(data as RawListItem);
    if (!base) return null;

    const rawMeta = data.raw_metadata as Record<string, unknown> | null | undefined;
    const offchainUri = rawMeta ? asString(rawMeta.offchain_uri) : null;

    const detail: EightAgentDetail = {
      ...base,
      agentWallet: asString(data.agent_wallet),
      creatorAddress: asString(data.creator_address),
      services: Array.isArray(data.services) ? (data.services as Array<Record<string, unknown>>) : [],
      tags: asStringArray(data.tags),
      categories: asStringArray(data.categories),
      scores: (data.scores && typeof data.scores === 'object') ? data.scores as Record<string, unknown> : null,
      totalScore: asNumber(data.total_score) ?? 0,
      ens: asString(data.ens),
      did: asString(data.did),
      mcpServer: asString(data.mcp_server),
      a2aEndpoint: asString(data.a2a_endpoint),
      agentUrl: asString(data.agent_url),
      rawAgentUri: offchainUri,
    };

    await redis.set(cacheKey, detail, { ex: CACHE_TTL });
    return detail;
  } catch (err) {
    console.warn('[8004scan] getAgentDetail failed:', err instanceof Error ? err.message : err);
    return null;
  }
}
