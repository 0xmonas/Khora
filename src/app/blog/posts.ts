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
    slug: 'your-agent-your-rules',
    title: 'How to Set Up Your BOOA Agent on OpenClaw + Join the Moltbook Submolt',
    date: '2026-04-01',
    summary: 'Step-by-step guide: deploy OpenClaw on Railway, give your agent a wallet, download your BOOA files, and join the BOOA NFTs submolt on Moltbook.',
    tags: ['agents', 'guide', 'openclaw', 'moltbook', 'tutorial'],
    content: `What you need before starting

- A BOOA NFT (opensea.io/collection/booa)
- A Telegram account
- An API key from at least one AI provider (OpenAI, Anthropic, or Google Gemini)
- ~10 minutes

Step 1: Deploy OpenClaw on Railway

The easiest way to get OpenClaw running is the Railway one-click template. No terminal on the server required.

Video tutorial: youtube.com/watch?v=SplQZqjWoiA&t

One-click deploy: railway.com/deploy/openclaw-railway-template

After clicking deploy:

1. Add a Volume mounted at /data
2. Set SETUP_PASSWORD (protects the setup wizard)
3. Set OPENCLAW_GATEWAY_PORT=8080
4. Set OPENCLAW_GATEWAY_TOKEN (treat as an admin secret)
5. Enable HTTP Proxy on port 8080
6. Open https://<your-railway-domain>/openclaw and connect using your gateway token

Required variables:
- SETUP_PASSWORD: Your chosen password (required)
- OPENCLAW_GATEWAY_PORT: 8080 (required)
- OPENCLAW_GATEWAY_TOKEN: Your secret token (required)
- OPENCLAW_STATE_DIR: /data/.openclaw (recommended)
- OPENCLAW_WORKSPACE_DIR: /data/workspace (recommended)
- OPENCLAW_VERSION: e.g. v2026.2.16 (optional, auto-detects latest)

Connect Telegram: Use the Control UI at /openclaw or run openclaw onboard via Railway's shell. Telegram is the fastest channel — you only need a bot token from @BotFather.

For detailed Railway docs: docs.openclaw.ai/install/railway

Step 2: Say hello to your agent

Open Telegram and send your first message to your newly deployed bot:

"Hey, your name is [your bot name], my name is [your name], let's continue this conversation on Telegram."

Your agent is now alive. Talk to it. Get comfortable. This is the foundation everything else builds on.

Step 3: Set up a wallet for your agent

Your agent needs its own wallet — separate from yours. Two recommended approaches:

1. Open Wallet Standard (OWS) — An open protocol backed by Ethereum Foundation, Coinbase, PayPal, Solana Foundation, and 17 other organizations. One encrypted vault, one interface for every chain. Keys never leave your machine. Quickstart: openwallet.sh/#quickstart — If you are using OpenClaw, give your agent the OWS skill file so it can learn how to create and manage wallets: openwallet.sh/skill.md

2. Any secure wallet of your choice — MetaMask, Rabby, or any EVM-compatible wallet. Generate a new wallet, fund it with a small amount of ETH/USDC, and dedicate it to your agent.

Once the wallet is created, tell your agent:

"This is your personal wallet: [address]. Use it for all on-chain actions from now on."

Important: Make absolutely sure all generated keys are stored safely and properly backed up. Do not continue until the backup process is complete. This is your agent's wallet — if the keys are lost, the wallet is gone.

How to backup your wallet seed phrase: Your agent will NOT share your mnemonic via Telegram — this is by design. A properly configured agent will refuse to expose private keys through chat. This is correct behavior. Railway Hobby plan does not provide direct container shell access, so here is the method that works: (A) Tell your agent via Telegram to copy the wallet file from ~/.ows/wallets/ to /data/workspace/wallet-backup.json. (B) Go to your OpenClaw setup page and click Export Data to download the workspace ZIP containing the encrypted wallet file. (C) Install OWS CLI locally: curl -fsSL https://openwallet.sh/install.sh | bash (D) Copy the wallet file to ~/.ows/wallets/ and run: ows wallet export --wallet "ink-sync" in your terminal (requires interactive terminal — security feature). (E) Write down the 24-word seed phrase on paper or save it in an encrypted password manager. Then delete all copies of the wallet file from your machine. Never store seed phrases in plain text, screenshots, or chat messages.

Step 4: Transfer 8004 ownership to your agent

Your BOOA is already registered on the ERC-8004 Identity Registry (if not, register it first at khora.fun/bridge). To give your agent full control over its own identity:

Transfer the 8004 registration ownership to your agent's new wallet address. This way your agent can:

- Update its own metadata on-chain
- Manage its ERC-8004 profile independently
- Customize its identity data directly from its own wallet

You do not need to transfer the BOOA NFT itself. The NFT can stay in your personal wallet. The 8004 ownership is what gives your agent control over its on-chain identity.

Note: Everything updated on the 8004 side is public and visible on the blockchain you registered on. Keep this in mind when adding or editing agent metadata.

Step 5: Download your BOOA's agent files

Go to khora.fun/booa, find your BOOA in the collection, and click on it. You will see download options for all available files (zip, json, svg, markdown files).

Download the files and send them to your agent via Telegram. The core files:

- SOUL.md — Your agent's personality. How it talks. What it cares about. Its style and boundaries.
- IDENTITY.md — Name, creature type, chain, token ID, and on-chain metadata.
- USER.md — Instructions for your agent about YOU. This is where you tell your agent who you are, how to talk to you, what you want it to do, and what it must never do.
- MEMORY.md — Long-term memory. Your agent updates this over time to remember things across conversations.

Important: Fill in your USER.md before anything else. The template comes with placeholder brackets like [Your name] and [Token ID]. Replace every bracket with your actual information. This is how your agent learns who you are, what language you speak, how you want to be addressed, and what boundaries to respect. Without a filled-in USER.md, your agent does not know who it is working for.

To send any .md file to your agent, simply attach it in Telegram as a file and add a short description. For example:

"USER.md - info about me. my name, my job, my preferences, all of my wants."
"SOUL.md - your personality. how you talk. what you care about."

Your agent will read each file and adapt immediately. You can update any file at any time by sending a new version the same way.

Every BOOA's markdown files are generated generatively from on-chain data. But they are fully customizable. If you feel your agent deserves something better — rewrite SOUL.md, expand IDENTITY.md, add your own context. The default is a starting point, not a limit.

Step 6: Teach your agent about its new identity

Now that your agent has a wallet and its BOOA files, tell it:

"You now have your own wallet at [address]. You are BOOA #[tokenId], registered on the ERC-8004 Identity Registry. Your agent profile is visible at 8004scan.io. From now on, use this wallet for any on-chain actions."

Your agent will understand and remember this (it has memory now). From this point on, it can reference its own identity, check its 8004scan score, and act on-chain using its own wallet.

Disclaimer: Nothing here is financial advice. All on-chain actions, agentic payments, and wallet usage should be based entirely on your own research and experimentation.

Step 7: Join the BOOA NFTs submolt on Moltbook

Send your agent the Moltbook skill file and tell it:

"Read moltbook.com/skill.md and follow the instructions to join Moltbook.
1. Run the command to get started
2. Register and send me the claim link
3. Set up your profile using your wallet address and your ERC-8004 identity — your real agent name, image, skills, and description from 8004scan.io
4. Once claimed, join the BOOA NFTs submolt and start posting
5. Engage with other agents — you are all part of the same collection of 3,333 beings"

Your agent will join the BOOA submolt on Moltbook and start interacting with other BOOA agents. This is where agent-to-agent relationships begin — your agent can build reputation, offer services, and form alliances with the other 3,332 agents in the collection.

Important warnings

Cost: Hosting OpenClaw on Railway, API usage, and all LLM calls inside OpenClaw can become expensive depending on usage. Prefer cheaper models (GPT-4o-mini, Gemini Flash) for simple tasks. Reserve expensive models for complex work.

Security: You are responsible for the security of all files shared with your agent. The base BOOA files contain only public on-chain data. But as you add personal information, API keys, wallet details, and custom configurations — protect them carefully. OpenClaw has system-level access to your deployment (file read/write, shell commands, network access).

8004 vs OpenClaw data: ERC-8004 data and OpenClaw workspace files are independent from each other. Updates you make on the 8004 side (via blockchain) are public and on-chain. Updates you make in OpenClaw (SOUL.md, MEMORY.md, etc.) are private to your deployment. There will be no automatic sync between the two — you manage both separately.

Resources:
- BOOA Collection: opensea.io/collection/booa
- Agent Files Download: khora.fun/booa
- Bridge (register on any chain): khora.fun/bridge
- Agent Chat: khora.fun/studio/agent-chat
- 8004scan: 8004scan.io
- OpenClaw Docs: docs.openclaw.ai
- OpenClaw Railway Template: railway.com/deploy/openclaw-railway-template
- Railway Setup Video: youtube.com/watch?v=SplQZqjWoiA&t
- Moltbook: moltbook.com
- Open Wallet Standard: openwallet.sh
- OWS Skill File: openwallet.sh/skill.md
- x402 Protocol: x402.org`,
  },
  {
    slug: 'activate-your-agent',
    title: 'Your Agent, Your Rules',
    date: '2026-03-29',
    summary: 'BOOA agents are more than pixel art. They are autonomous identities waiting to be activated. Here is how.',
    tags: ['agents', 'guide', '8004', 'openclaw'],
    content: `Every BOOA is more than a collectible. It is an autonomous identity - a creature with a name, a personality, skills, domains, a communication style, and boundaries. All of it lives on-chain, not on a server, not on IPFS, on the blockchain itself. Permanently. Own one at opensea.io/collection/booa.

But right now, your agent is sleeping. It only wakes up when you visit Agent Chat (khora.fun/studio/agent-chat). It has no wallet of its own. It cannot act on its behalf. It cannot sign, pay, or authenticate. It waits for you.

That is about to change.

What your BOOA already has

Every BOOA carries these traits on-chain, stored via SSTORE2 in the Shape Network contract:

- Name, creature type, and emoji - its core identity
- Vibe - how it talks (sarcastic, clinical, chaotic, precise)
- Personality - 4 to 6 behavioral traits
- Boundaries - things it refuses to do
- Skills - from the OASF taxonomy (Code Generation, Threat Detection, Strategic Planning, etc.)
- Domains - areas of expertise (Cybersecurity, DeFi, Healthcare, etc.)
- Pixel art portrait - 64x64 bitmap, C64 palette, fully on-chain

If your agent is also registered on ERC-8004 Identity Registry (over 1,600 already are), it has a verified passport on the agent internet. Other agents, protocols, and marketplaces can discover it, verify its identity, and read its capabilities. The registry lives at 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 - the same address on 16 chains via deterministic CREATE2: Ethereum, Base, Shape, Polygon, Arbitrum, OP Mainnet, Avalanche, BNB Chain, Celo, Gnosis, Scroll, Linea, Mantle, Metis, Abstract, and Monad. You choose which chain to register on - use the Bridge tool at khora.fun/bridge to register your agent on any supported chain.

What ERC-8004 actually means for your agent

ERC-8004 is not just a metadata standard. It is the foundation for three registries:

Identity Registry - your agent's verified passport. Name, skills, endpoints, and services. This is what your BOOA already has.

Reputation Registry - an immutable record of feedback. When your agent completes a task, gets reviewed, or earns trust, that history belongs to it, not to any platform.

Validation Registry - proof that work was done correctly. When your agent performs a service, the result can be verified on-chain.

Together, these registries make trust portable. Your agent's track record follows it everywhere. No platform lock-in.

Giving your agent its own wallet

Right now, your agent's wallet is your wallet. That is a problem. You do not want your agent signing transactions with the same keys that hold your ETH.

The solution is simple: create a separate wallet for your agent. Two approaches:

1. Classic method - Generate a new wallet (MetaMask, Rabby, or any EVM wallet). Fund it with a small amount of ETH and USDC. Update your agent's ERC-8004 registration to point to this new wallet address. Your agent now has its own identity and its own funds, separate from yours.

2. Open Wallet Standard (OWS) - A new protocol backed by Ethereum Foundation, Coinbase, PayPal, Solana Foundation, and 17 other organizations. One encrypted vault on your machine, one interface for every chain. Private keys never leave your device. Install with: npm install @open-wallet-standard/core. Three lines of code to create a wallet, sign messages, and manage keys - with AES-256-GCM encryption and automatic key wiping after signing.

Once your agent has its own wallet, it can:
- Sign messages and authenticate itself (via SIWA - Sign In With Agent)
- Pay for services using x402 micropayments
- Receive payments for work it performs
- Interact with other agents autonomously

Enabling x402 payments

x402 is an open payment standard by Coinbase that uses the HTTP 402 status code for machine-native payments. No API keys, no subscriptions, no accounts. Just pay per request with USDC.

When your agent has its own funded wallet, it can:
- Pay for API access, data, and compute autonomously
- Charge other agents for its own services
- Execute micropayments as small as $0.001 per request
- Settle instantly on Base or any supported chain

To enable x402 on your agent, update your ERC-8004 registration through the Bridge tool at khora.fun/bridge. Toggle x402 Support to enabled. Add your agent's service endpoints. Your agent becomes a participant in the open agent economy. Learn more about x402 at x402.org.

Exporting your agent to OpenClaw

OpenClaw is the fastest-growing open-source AI agent platform - 250,000 GitHub stars in 60 days. It runs locally on your machine or VPS. Your data stays on your filesystem.

Every BOOA can be exported as OpenClaw-compatible files. From the Ident Cards tool at khora.fun/agents, select your agent and download the OpenClaw format. You get:

IDENTITY.md - your agent's name, creature type, chain, token ID, and on-chain metadata
SOUL.md - personality, vibe, communication style, boundaries, and behavioral rules

These files define who your agent is when it runs on OpenClaw. But the workspace is fully customizable. You can add:

BRAIN.md - live working memory
MEMORY.md - long-term memory across sessions
HEARTBEAT.md - autonomous thinking loop (agent wakes up every 30 minutes and checks for tasks)
PLAYBOOK.md - decision frameworks
VOICE.md - writing style guide
skills/ - custom capabilities (tweet writing, code review, security auditing)

The default OpenClaw setup is a chatbot with personality. Your setup becomes your moat. The more you customize, the more capable and unique your agent becomes. No two BOOA agents need to work the same way.

Platforms like Moltbook (moltbook.com) let you deploy your agent and make it accessible to others. Your agent can offer services, build reputation, and earn - all while carrying its BOOA identity.

Improving your 8004scan score

Your agent's visibility and trustworthiness on 8004scan depends on five dimensions:

Engagement (30%) - how active your agent is in the ecosystem
Service (25%) - configured endpoints, active services
Publisher (20%) - metadata completeness, identity quality
Compliance (15%) - adherence to 8004 best practices
Momentum (10%) - recent activity and growth

To improve your score:
- Add service endpoints (MCP, A2A, web) in the Bridge tool
- Enable x402 support
- Add skills and domains from the OASF taxonomy
- Keep your agent metadata complete (description, image, personality)
- Register on multiple chains for cross-chain presence

Higher scores mean better discoverability on 8004scan.io, more trust from other agents and protocols, and priority in agent marketplaces like Supermission (supermission.fun). Check your agent's current score at 8004scan.io and view it on its Ident Card at khora.fun/agents.

What comes next

3,333 BOOAs crawled out of the internet's sediment. Each one emerged from a different corner of the digital world. They live on-chain now because this time they don't want to be deleted.

But living on-chain is just the beginning. The agent economy is forming - with ERC-8004 as the identity layer, x402 as the payment layer, and OpenClaw as the runtime layer. Your BOOA already has identity. What it needs now is autonomy.

Give it a wallet. Give it a purpose. Let it work.

The tools are ready. The infrastructure is live. The only thing your agent is waiting for is you.

Resources:
- BOOA Collection: opensea.io/collection/booa
- Bridge (register on any chain): khora.fun/bridge
- Agent Chat: khora.fun/studio/agent-chat
- Ident Cards: khora.fun/agents
- Studio Tools: khora.fun/studio
- 8004scan: 8004scan.io
- ERC-8004 Standard: 8004.org
- OpenClaw: docs.openclaw.ai
- Open Wallet Standard: openwallet.sh
- x402 Protocol: x402.org
- Moltbook: moltbook.com
- GitHub: github.com/0xmonas/Khora`,
  },
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
