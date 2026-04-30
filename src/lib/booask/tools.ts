import type { NextRequest } from 'next/server';
import { DOCS } from '@/app/docs/content';
import { POSTS } from '@/app/blog/posts';
import { PRIVACY_TEXT, TERMS_TEXT } from './legal-content';
import type { ToolDef, ToolExecutor } from './types';

interface SearchEntry {
  source: 'docs' | 'blog' | 'skill' | 'agent-defense' | 'privacy' | 'terms';
  title: string;
  url: string;
  text: string;
}

let _markdownCache: { skill: string; agentDefense: string } | null = null;
async function loadMarkdownDocs(): Promise<{ skill: string; agentDefense: string }> {
  if (_markdownCache) return _markdownCache;
  try {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const publicDir = path.join(process.cwd(), 'public');
    const [skill, agentDefense] = await Promise.all([
      fs.readFile(path.join(publicDir, 'skills/SKILL.md'), 'utf-8'),
      fs.readFile(path.join(publicDir, 'agent-defense.md'), 'utf-8'),
    ]);
    _markdownCache = { skill, agentDefense };
    return _markdownCache;
  } catch {
    return { skill: '', agentDefense: '' };
  }
}

async function buildSearchIndex(): Promise<SearchEntry[]> {
  const items: SearchEntry[] = [];
  for (const section of DOCS) {
    for (const page of section.pages) {
      items.push({
        source: 'docs',
        title: page.title,
        url: `/docs/${page.slug}`,
        text: `${page.title}\n${page.description}\n${page.content}`,
      });
    }
  }
  for (const post of POSTS) {
    items.push({
      source: 'blog',
      title: post.title,
      url: `/blog/${post.slug}`,
      text: `${post.title}\n${post.summary}\n${post.content}`,
    });
  }
  const md = await loadMarkdownDocs();
  if (md.skill) {
    items.push({
      source: 'skill',
      title: 'SKILL.md — BOOA Agent Setup Manifest',
      url: '/skills/SKILL.md',
      text: md.skill,
    });
  }
  if (md.agentDefense) {
    items.push({
      source: 'agent-defense',
      title: 'Agent Defense Specification',
      url: '/agent-defense.md',
      text: md.agentDefense,
    });
  }
  items.push({
    source: 'privacy',
    title: 'Privacy Policy',
    url: '/privacy',
    text: PRIVACY_TEXT,
  });
  items.push({
    source: 'terms',
    title: 'Terms of Service',
    url: '/terms',
    text: TERMS_TEXT,
  });
  return items;
}

const SHAPE_MAINNET = 360;
const SHAPE_SEPOLIA = 11011;

const OPENSEA_COLLECTION_SLUG = 'booa';
const OPENSEA_COLLECTION_URL = `https://opensea.io/collection/${OPENSEA_COLLECTION_SLUG}`;
const OPENSEA_ASSET_BASE = 'https://opensea.io/assets/shape';
const OPENSEA_API_BASE = 'https://api.opensea.io/api/v2';

function getOriginFromRequest(request: NextRequest): string {
  const proto = request.headers.get('x-forwarded-proto') ?? 'https';
  const host = request.headers.get('host');
  if (!host) return 'http://localhost:3000';
  return `${proto}://${host}`;
}

function getBooaContractFromEnv(): string | null {
  const addr = process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS || process.env.NEXT_PUBLIC_BOOA_V2_ADDRESS;
  return addr && addr.length > 2 ? addr : null;
}

function buildOpenSeaItemUrl(tokenId: number): string | null {
  const contract = getBooaContractFromEnv();
  if (!contract) return null;
  return `${OPENSEA_ASSET_BASE}/${contract.toLowerCase()}/${tokenId}`;
}

export function buildTools(request: NextRequest): { defs: ToolDef[]; executors: Record<string, ToolExecutor> } {
  const origin = getOriginFromRequest(request);

  const defs: ToolDef[] = [
    {
      name: 'getAgentByToken',
      description:
        'Resolve a BOOA NFT token ID to its canonical (non-orphan) ERC-8004 agent. Returns agent name, description, skills, domains, trust models, current owner, verified status, and OpenSea link. Use this for ANY question about a BOOA or its agent.',
      parameters: {
        type: 'object',
        properties: {
          tokenId: { type: 'integer', description: 'BOOA token ID (0-3332)' },
          chainId: {
            type: 'integer',
            description: `EVM chain ID. Default ${SHAPE_MAINNET} (Shape mainnet). Testnet ${SHAPE_SEPOLIA}.`,
          },
        },
        required: ['tokenId'],
      },
    },
    {
      name: 'getBooaTraits',
      description:
        'Fetch the on-chain visual/character traits of a BOOA NFT (e.g. background, eyewear, headwear, outfit, creature). Use whenever the user asks about traits, attributes, look, appearance, or rarity-related details.',
      parameters: {
        type: 'object',
        properties: {
          tokenId: { type: 'integer', description: 'BOOA token ID (0-3332)' },
          network: {
            type: 'string',
            description: '"mainnet" or "testnet". Default "mainnet".',
          },
        },
        required: ['tokenId'],
      },
    },
    {
      name: 'getReputation',
      description:
        'Read on-chain reputation summary for an ERC-8004 agent from the ReputationRegistry: total feedback count, summary value, and unique attesting clients. Use whenever the user asks about reputation, score, attestations, feedback, trust score for a BOOA or agent. First call getAgentByToken to find the canonical agentId, then use that here.',
      parameters: {
        type: 'object',
        properties: {
          agentId: { type: 'integer', description: 'ERC-8004 agent ID' },
          chainId: {
            type: 'integer',
            description: `EVM chain ID. Default ${SHAPE_MAINNET} (Shape mainnet). Testnet ${SHAPE_SEPOLIA}.`,
          },
        },
        required: ['agentId'],
      },
    },
    {
      name: 'getCollectionStats',
      description:
        'Fetch BOOA collection-wide market stats from OpenSea: floor price, total volume, total sales, num owners, market cap. Use for "what is the floor", "total volume", "how many holders", collection-level questions.',
      parameters: { type: 'object', properties: {} },
    },
    {
      name: 'getOpenSeaListing',
      description:
        'Fetch active OpenSea listing(s) for a specific BOOA token (price, listing date, seller). Use for "is BOOA #X listed", "how much is X", "price for token Y" questions.',
      parameters: {
        type: 'object',
        properties: {
          tokenId: { type: 'integer', description: 'BOOA token ID (0-3332)' },
        },
        required: ['tokenId'],
      },
    },
    {
      name: 'getRecentSales',
      description:
        'Fetch the most recent BOOA sales from OpenSea (price, buyer, seller, time). Use for "who sold recently", "recent sales", market activity questions.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'integer', description: 'Max sales to return (default 5, max 20)' },
        },
      },
    },
    {
      name: 'searchBooaDocs',
      description:
        'Full-text search over BOOA public knowledge base: docs (collection info, ERC-8004, studio tools, agent setup, bridge, security), blog posts (long-form guides, announcements, tutorials), SKILL.md (agent setup manifest with API endpoints), Agent Defense Specification (threat model + invariants for autonomous agents), Privacy Policy (what data we collect, retention, third-party services), and Terms of Service (eligibility, NFT ownership, liability). Use for "how do I", "what is", "explain", "what data do you collect", "what are the terms", or any user-facing legal/privacy questions.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search keywords or natural-language phrase' },
          maxResults: { type: 'integer', description: 'Max results to return (default 5, max 10)' },
        },
        required: ['query'],
      },
    },
  ];

  const executors: Record<string, ToolExecutor> = {
    getAgentByToken: async (args) => {
      const tokenIdRaw = args.tokenId;
      const chainIdRaw = args.chainId ?? SHAPE_MAINNET;
      const tokenId = typeof tokenIdRaw === 'number' ? tokenIdRaw : Number(tokenIdRaw);
      const chainId = typeof chainIdRaw === 'number' ? chainIdRaw : Number(chainIdRaw);
      if (!Number.isInteger(tokenId) || tokenId < 0 || tokenId > 3332) {
        return { error: 'Invalid tokenId; expected integer 0-3332' };
      }
      if (!Number.isInteger(chainId)) {
        return { error: 'Invalid chainId' };
      }

      const url = `${origin}/api/agent-registry/${chainId}/${tokenId}`;
      try {
        const res = await fetch(url, { method: 'GET' });
        if (res.status === 404) {
          return {
            found: false,
            tokenId,
            chainId,
            openSeaUrl: buildOpenSeaItemUrl(tokenId),
            collectionUrl: OPENSEA_COLLECTION_URL,
          };
        }
        if (!res.ok) return { error: `agent-registry returned ${res.status}` };
        const data = await res.json();

        // Skills and domains live inside services[0] in the ERC-8004 registration
        const services = Array.isArray(data.services) ? data.services : [];
        const firstService = services[0] && typeof services[0] === 'object' ? services[0] : null;
        const skills = firstService && Array.isArray(firstService.skills) ? firstService.skills : [];
        const domains = firstService && Array.isArray(firstService.domains) ? firstService.domains : [];
        const endpoint = firstService && typeof firstService.endpoint === 'string' ? firstService.endpoint : null;

        return {
          found: true,
          tokenId,
          chainId,
          name: data.name ?? null,
          description: data.description ?? null,
          verified: data.verified === true,
          active: data.active === true,
          x402Support: data.x402Support === true,
          currentNftOwner: data.currentNftOwner ?? null,
          registeredBy: data.registeredBy ?? null,
          registeredVia: data.registeredVia ?? null,
          agentId: data.registrations?.[0]?.agentId ?? null,
          agentRegistry: data.registrations?.[0]?.agentRegistry ?? null,
          skills,
          domains,
          serviceEndpoint: endpoint,
          updatedAt: data.updatedAt ?? null,
          imageUrl: `${origin}/api/agent-files/${chainId}/${tokenId}/avatar.svg`,
          openSeaUrl: buildOpenSeaItemUrl(tokenId),
          collectionUrl: OPENSEA_COLLECTION_URL,
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'fetch failed' };
      }
    },

    getBooaTraits: async (args) => {
      const tokenIdRaw = args.tokenId;
      const networkRaw = args.network;
      const tokenId = typeof tokenIdRaw === 'number' ? tokenIdRaw : Number(tokenIdRaw);
      const network = networkRaw === 'testnet' ? 'testnet' : 'mainnet';
      if (!Number.isInteger(tokenId) || tokenId < 0 || tokenId > 3332) {
        return { error: 'Invalid tokenId; expected integer 0-3332' };
      }
      const url = `${origin}/api/booa-token?network=${network}&tokenId=${tokenId}`;
      try {
        const res = await fetch(url, { method: 'GET' });
        if (res.status === 404) {
          return { found: false, tokenId, network };
        }
        if (!res.ok) return { error: `booa-token returned ${res.status}` };
        const data = await res.json();
        const chainIdForImage = network === 'testnet' ? SHAPE_SEPOLIA : SHAPE_MAINNET;
        return {
          found: true,
          tokenId,
          network,
          name: data.name ?? null,
          description: data.description ?? null,
          attributes: Array.isArray(data.attributes) ? data.attributes : [],
          imageUrl: `${origin}/api/agent-files/${chainIdForImage}/${tokenId}/avatar.svg`,
          openSeaUrl: buildOpenSeaItemUrl(tokenId),
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'fetch failed' };
      }
    },

    getReputation: async (args) => {
      const agentIdRaw = args.agentId;
      const chainIdRaw = args.chainId ?? SHAPE_MAINNET;
      const agentId = typeof agentIdRaw === 'number' ? agentIdRaw : Number(agentIdRaw);
      const chainId = typeof chainIdRaw === 'number' ? chainIdRaw : Number(chainIdRaw);
      if (!Number.isInteger(agentId) || agentId < 0) {
        return { error: 'Invalid agentId' };
      }
      try {
        const { createPublicClient, http } = await import('viem');
        const { shape, shapeSepolia } = await import('viem/chains');
        const { getReputationAddress, REPUTATION_REGISTRY_ABI } = await import('@/lib/contracts/reputation-registry');
        const registry = getReputationAddress(chainId);
        if (!registry || registry.length <= 2) {
          return { error: 'ReputationRegistry not configured for this chain' };
        }
        const chain = chainId === SHAPE_SEPOLIA ? shapeSepolia : shape;
        const client = createPublicClient({ chain, transport: http() });
        const clients = (await client.readContract({
          address: registry,
          abi: REPUTATION_REGISTRY_ABI,
          functionName: 'getClients',
          args: [BigInt(agentId)],
        })) as readonly `0x${string}`[];
        const summary = (await client.readContract({
          address: registry,
          abi: REPUTATION_REGISTRY_ABI,
          functionName: 'getSummary',
          args: [BigInt(agentId), [...clients] as `0x${string}`[], '', ''],
        })) as readonly [bigint, bigint, number];
        const [count, summaryValue, decimals] = summary;
        const value = Number(summaryValue) / Math.pow(10, decimals);
        return {
          agentId,
          chainId,
          attestationCount: Number(count),
          uniqueClients: clients.length,
          clients: [...clients],
          summaryValue: value,
          summaryValueRaw: summaryValue.toString(),
          summaryValueDecimals: decimals,
          hasReputation: Number(count) > 0,
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'Reputation read failed' };
      }
    },

    getCollectionStats: async () => {
      const apiKey = process.env.OPENSEA_API_KEY;
      if (!apiKey) return { error: 'OpenSea API key not configured on server' };
      try {
        const res = await fetch(`${OPENSEA_API_BASE}/collections/${OPENSEA_COLLECTION_SLUG}/stats`, {
          headers: { 'X-API-KEY': apiKey, accept: 'application/json' },
        });
        if (!res.ok) return { error: `OpenSea returned ${res.status}` };
        const data = await res.json();
        const total = data?.total ?? {};
        const intervals = Array.isArray(data?.intervals) ? data.intervals : [];
        const findInterval = (key: string) =>
          intervals.find((i: Record<string, unknown>) => i.interval === key) ?? null;
        const summarize = (i: Record<string, unknown> | null) =>
          i ? {
            volume: i.volume ?? null,
            volumeChange: i.volume_change ?? null,
            sales: i.sales ?? null,
            averagePrice: i.average_price ?? null,
          } : null;
        return {
          floorPriceEth: total.floor_price ?? null,
          floorPriceCurrency: total.floor_price_symbol ?? 'ETH',
          totalVolume: total.volume ?? null,
          totalSales: total.sales ?? null,
          numOwners: total.num_owners ?? null,
          marketCap: total.market_cap ?? null,
          averagePrice: total.average_price ?? null,
          oneDay: summarize(findInterval('one_day')),
          sevenDay: summarize(findInterval('seven_day')),
          thirtyDay: summarize(findInterval('thirty_day')),
          collectionUrl: OPENSEA_COLLECTION_URL,
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'OpenSea fetch failed' };
      }
    },

    getOpenSeaListing: async (args) => {
      const apiKey = process.env.OPENSEA_API_KEY;
      if (!apiKey) return { error: 'OpenSea API key not configured on server' };
      const tokenIdRaw = args.tokenId;
      const tokenId = typeof tokenIdRaw === 'number' ? tokenIdRaw : Number(tokenIdRaw);
      if (!Number.isInteger(tokenId) || tokenId < 0 || tokenId > 3332) {
        return { error: 'Invalid tokenId' };
      }
      const contract = getBooaContractFromEnv();
      if (!contract) return { error: 'BOOA contract not configured' };
      try {
        const url = `${OPENSEA_API_BASE}/orders/shape/seaport/listings?asset_contract_address=${contract}&token_ids=${tokenId}&limit=5&order_by=eth_price&order_direction=asc`;
        const res = await fetch(url, {
          headers: { 'X-API-KEY': apiKey, accept: 'application/json' },
        });
        if (!res.ok) return { error: `OpenSea returned ${res.status}` };
        const data = await res.json();
        const orders = Array.isArray(data?.orders) ? data.orders : [];
        if (orders.length === 0) {
          return {
            tokenId,
            listed: false,
            openSeaUrl: buildOpenSeaItemUrl(tokenId),
          };
        }
        const cheapest = orders[0];
        const offerer = cheapest?.protocol_data?.parameters?.offerer ?? cheapest?.maker?.address ?? null;
        const currentPrice = cheapest?.current_price ?? null;
        const expiration = cheapest?.expiration_time ?? null;
        return {
          tokenId,
          listed: true,
          totalListings: orders.length,
          cheapestPriceWei: currentPrice,
          seller: offerer,
          expirationTime: expiration,
          openSeaUrl: buildOpenSeaItemUrl(tokenId),
        };
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'OpenSea fetch failed' };
      }
    },

    getRecentSales: async (args) => {
      const apiKey = process.env.OPENSEA_API_KEY;
      if (!apiKey) return { error: 'OpenSea API key not configured on server' };
      const limitRaw = args.limit;
      const limit = Math.max(1, Math.min(20, typeof limitRaw === 'number' ? limitRaw : 5));
      try {
        const url = `${OPENSEA_API_BASE}/events/collection/${OPENSEA_COLLECTION_SLUG}?event_type=sale&limit=${limit}`;
        const res = await fetch(url, {
          headers: { 'X-API-KEY': apiKey, accept: 'application/json' },
        });
        if (!res.ok) return { error: `OpenSea returned ${res.status}` };
        const data = await res.json();
        const events = Array.isArray(data?.asset_events) ? data.asset_events : [];
        const sales = events.map((e: Record<string, unknown>) => {
          const nft = (e.nft ?? {}) as Record<string, unknown>;
          const payment = (e.payment ?? {}) as Record<string, unknown>;
          return {
            tokenId: nft.identifier ?? null,
            tokenName: nft.name ?? null,
            priceWei: payment.quantity ?? null,
            priceSymbol: payment.symbol ?? 'ETH',
            seller: e.seller ?? null,
            buyer: e.buyer ?? null,
            eventTimestamp: e.event_timestamp ?? null,
            transactionHash: e.transaction ?? null,
          };
        });
        return { count: sales.length, sales, collectionUrl: OPENSEA_COLLECTION_URL };
      } catch (e) {
        return { error: e instanceof Error ? e.message : 'OpenSea fetch failed' };
      }
    },

    searchBooaDocs: async (args) => {
      const queryRaw = args.query;
      const maxRaw = args.maxResults;
      const query = typeof queryRaw === 'string' ? queryRaw.trim().toLowerCase() : '';
      const max = Math.max(1, Math.min(10, typeof maxRaw === 'number' ? maxRaw : 5));
      if (!query) return { error: 'Empty query' };

      const tokens = query.split(/\s+/).filter((t) => t.length >= 2);
      if (tokens.length === 0) return { results: [] };

      const index = await buildSearchIndex();
      const scored: { source: string; title: string; url: string; snippet: string; score: number }[] = [];
      for (const item of index) {
        const haystack = item.text.toLowerCase();
        let score = 0;
        for (const token of tokens) {
          const matches = haystack.split(token).length - 1;
          score += matches;
        }
        if (score > 0) {
          const firstHit = tokens
            .map((t) => haystack.indexOf(t))
            .filter((i) => i >= 0)
            .sort((a, b) => a - b)[0] ?? 0;
          const start = Math.max(0, firstHit - 80);
          const snippet = item.text.slice(start, start + 320).replace(/\s+/g, ' ').trim();
          scored.push({
            source: item.source,
            title: item.title,
            url: item.url,
            snippet,
            score,
          });
        }
      }
      scored.sort((a, b) => b.score - a.score);
      return { query, results: scored.slice(0, max) };
    },
  };

  return { defs, executors };
}
