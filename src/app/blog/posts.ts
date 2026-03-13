export interface BlogPost {
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  summary: string;
  content: string; // plain text paragraphs separated by \n\n
  tags?: string[];
}

export const POSTS: BlogPost[] = [
  // Add new posts at the top (newest first)
  {
    slug: 'khora-api',
    title: 'Khora API is live',
    date: '2026-03-13',
    summary: 'BOOA and ERC-8004 agent data is on-chain. Now it is accessible too.',
    tags: ['engineering', 'api'],
    content: `BOOA NFT data and ERC-8004 agent identities have always been public. Every bitmap, trait, registration, and transfer lives on-chain. But public and accessible are not the same thing. Reading a 2,048-byte bitmap from SSTORE2 or decoding a base64 agentURI from the Identity Registry requires deep contract knowledge. That has kept many good ideas on the sidelines.

Today we are opening our data APIs and documenting them in a single reference.

What the APIs cover

Agent identities — /api/agent-card returns a complete ERC-8004 agent identity for any registered agent on any of 18 supported chains. Name, description, image, services, skills, domains, x402 payment support, trust mechanisms, and computed agent scores — all from a single GET request.

Agent discovery — /api/discover-agents scans a specific chain for all agents owned by a wallet address. It uses multicall with sparse-then-dense probing to efficiently find token IDs without a subgraph. Pass an address and a chain, get back every agent that wallet controls.

BOOA collection — /api/gallery returns all BOOA NFTs in a contract, including on-chain SVG art rendered from the bitmap. /api/fetch-nfts returns all NFTs owned by a wallet on any supported chain.

All endpoints are documented at khora.fun/llms.txt — a plain text reference designed to be dropped into an LLM context window. This is the fastest way to start building.

Use cases

AI agents that can answer "what skills does agent #9 on Base Sepolia have?" by hitting a single endpoint. Drop /llms.txt into a context window and the agent already knows what to call.

Agent directories and marketplaces that aggregate ERC-8004 registrations across chains. The discover-agents endpoint handles the multicall plumbing so you can focus on the product.

Analytics dashboards that track agent registrations, skill distributions, and identity completeness scores across the 18 supported chains.

Alternative frontends for BOOA — the on-chain SVG art, traits, and metadata are all available via the gallery endpoint. The best BOOA viewer might not exist yet.

Wallet integrations that show a user's registered agent identities alongside their NFTs.

Getting started

Start with /llms.txt. It covers every endpoint, parameter, and response format in a single file. No API key required. Rate limit is 60 requests per 60 seconds per IP.

Supported chains: Ethereum, Base, Shape, Polygon, Arbitrum, OP Mainnet, Avalanche, BNB Chain, Celo, Gnosis, Scroll, Linea, Mantle, Metis, Abstract, Monad, Base Sepolia, Shape Sepolia.

ERC-8004 Identity Registry is deployed at the same deterministic CREATE2 address on all chains. BOOA NFTs live on Shape.

What's next

We will watch how people use the API and iterate based on what we learn. The data has been on-chain since day one. Making it easier to work with opens the door for more people to build with it.`,
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}
