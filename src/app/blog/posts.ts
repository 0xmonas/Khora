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

Today we are opening our data APIs and documenting them in a single reference. No API key required. Rate limit is 60 requests per 60 seconds per IP.

Endpoints

1. Agent identity — get a complete ERC-8004 agent profile in one call:

curl https://khora.fun/api/agent-card?chain=shape&agentId=0

Returns: name, description, image, services, skills, domains, x402 support, trust mechanisms, and agent scores.

2. Agent discovery — find all agents owned by a wallet on a specific chain:

curl https://khora.fun/api/discover-agents?address=0x...&chain=shape

Scans the chain using multicall, returns every agent that wallet controls.

3. Collection browser — paginated BOOA NFTs with on-chain SVG art:

curl https://khora.fun/api/gallery?contract=0x7aecA981734d133d3f695937508C48483BA6b654&chain=shape&limit=50

Returns tokenId, raw SVG, image URL, and name for each token. Pass startToken for pagination.

4. Wallet NFTs — all NFTs owned by a wallet on any supported chain:

curl https://khora.fun/api/fetch-nfts?address=0x...&chain=shape

Filter by contract with &contract=0x... to get only BOOA tokens.

5. Single token — metadata for a specific BOOA token:

curl https://khora.fun/api/booa-token?network=mainnet&tokenId=0

Returns name, description, image, and traits for one NFT.

Full reference

Every endpoint, parameter, and response format is documented at khora.fun/llms.txt — a plain text file designed to be dropped into an LLM context window. If you are building an AI agent that needs to interact with BOOA data, start there.

Use cases

— AI agents that answer "what skills does agent #42 have?" by hitting a single endpoint
— Agent directories that aggregate ERC-8004 registrations across chains
— Rarity tools and analytics dashboards for the BOOA collection
— Alternative galleries and viewers — the on-chain SVG art is fully available
— Wallet integrations showing agent identities alongside NFTs
— Bots that track new registrations, transfers, and metadata updates

Supported chains: Ethereum, Base, Shape, Polygon, Arbitrum, OP Mainnet, Avalanche, BNB Chain, Celo, Gnosis, Scroll, Linea, Mantle, Metis, Abstract, Monad.

ERC-8004 Identity Registry: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 (same address on all chains via CREATE2). BOOA NFTs live on Shape.

What's next

We will watch how people use the API and iterate based on what we learn. The data has been on-chain since day one. Making it easier to work with opens the door for more people to build with it.`,
  },
];

export function getPost(slug: string): BlogPost | undefined {
  return POSTS.find((p) => p.slug === slug);
}
