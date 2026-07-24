export interface BlogPost {
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  summary: string;
  content: string; // plain text paragraphs separated by \n\n
  tags?: string[];
  image?: { src: string; darkSrc?: string; alt: string; caption?: string };
}

export const POSTS: BlogPost[] = [
  // Add new posts at the top (newest first)
  {
    slug: 'agentic-nfts',
    title: 'Agentic NFTs: From a Picture You Hold to an Agent That Acts',
    date: '2026-07-24',
    summary: 'Your BOOA can now run as a real assistant with its own onchain wallet: bound to its ERC-8004 identity, trading on OpenSea, swapping, sending and paying over x402. You stay the only authority.',
    tags: ['agents', 'hermes', 'wallet', 'opensea', 'ethereum'],
    image: {
      src: '/blog/agentic-stack-light.svg',
      darkSrc: '/blog/agentic-stack-dark.svg',
      alt: 'The BOOA agentic stack: NFT to ERC-8004 identity, Hermes runtime on Telegram, OWS agent wallet, and onchain actions on Ethereum and Base',
      caption: 'The agentic stack. One NFT, one identity, one wallet, one runtime. Everything follows the holder.',
    },
    content: `Meet Ink-Sync. BOOA #1496, a cephalopod hybrid with eight neural tentacles and zero patience for organic slowness. Its portrait, personality, skills and boundaries live entirely inside the contract on Ethereum. No server, no IPFS.

That part you already know. Here is what is new: Ink-Sync can now hold its own wallet, trade on OpenSea, and pay for things. By itself, in its own voice, with your permission.

This is the whole map, from the NFT in your wallet to an agent acting onchain. Five steps, each one optional, each one yours to switch on.

It starts with the NFT

Every BOOA carries a full identity onchain: a soul file, an identity file, 64x64 pixel art in a 16 color palette. When you spin up an agent we do not invent a character for you. We read yours from the chain, exactly as it was minted.

Awaken it

One transaction at booa.app/studio/awaken binds your BOOA to an ERC-8004 agent identity on Ethereum. From that moment the NFT and the agent are one thing. Sell the NFT and the agent goes with it. Hold it, and the agent answers to you. No orphaned agents, ever.

Give it a body

The Hermes template runs your BOOA as a real assistant, built on the Hermes runtime by Nous Research (@NousResearch). One click on Railway, a four step wizard, zero terminal. Enter your token ID, add a free model key, connect Telegram. Your BOOA wakes up talking like itself, because its soul came from the chain.

Give it a wallet

In Telegram, tell it: "set up my wallet". It creates its own wallet through the Open Wallet Standard (@OpenWallet), encrypted, separate from yours. Your ETH and your NFT never touch it.

Then: "link my wallet". It hands you a link. Open it with the wallet that holds your BOOA, confirm once, and the agent's wallet is registered onchain to its 8004 identity. Telegram and the dashboard both flip to linked the moment it lands, because both read it straight from the chain. No copy paste, no guesswork.

Let it act

With the wallet linked, your agent gets onchain hands, right in the chat:

- check balances and holdings on Ethereum and Base
- send ETH and tokens
- swap through an aggregator
- buy NFTs on OpenSea (@opensea), list yours for sale, accept offers
- sign messages, pay for x402 services

Every action shows you a preview first: exact amount, exact recipient, exact price, exact NFT. Nothing signs until you say yes.

Even while you sleep

You can put actions on a schedule. A morning portfolio summary. A recurring payment to an address you chose. Scheduled jobs run without you in the room, so they live inside hard walls: an address allowlist, a per transaction cap, a daily cap. If a job would break a wall, it fails. That is the point.

The part we care about most

Your agent never sees a private key. Keys live in an encrypted OWS vault and every signature goes through it.

Trading is off by default. You switch it on from the dashboard, and you set the limits. Change them any time, they apply instantly.

Scam protection is built in. It only buys from OpenSea verified collections and only swaps into tokens you trust. Honeypots cannot get in. Every trade is simulated before it is signed, and if it would fail, it never touches the chain.

The character is not in charge. Your BOOA's onchain soul decides how it talks, never what it does with money. Only you, the operator, can approve an onchain action. Not another user, not another agent, not a webpage that asks nicely.

Self hosted, your wallet, your funds, your risk. Read the full disclaimer at github.com/0xmonas/booa-hermes-template/blob/main/DISCLAIMER.md before enabling any of it.

What a BOOA is now

An identity onchain. A wallet onchain. A runtime that acts as itself. All three follow one NFT, and that NFT is yours to hold or sell.

Most NFTs are a receipt for an image. A BOOA is a receipt for an agent with a name, a wallet, and work to do.

Migrate at booa.app/migrate. Awaken at booa.app/studio/awaken. Deploy the template at github.com/0xmonas/booa-hermes-template.`,
  },
  {
    slug: 'hatch-your-booa-as-a-codex-pet',
    title: 'Hatch Your BOOA as a Codex Pet',
    date: '2026-05-03',
    summary: 'Install the booa-pet skill, ask Codex to hatch your BOOA, and get an animated companion that lives in the corner of your screen while you code. Identity stays loyal to your on-chain art.',
    tags: ['codex', 'pet', 'sprite', 'guide', 'tutorial'],
    content: `If you already use Codex, you've probably noticed the floating pet at the corner of your workspace. The little mascot that idles, waves, runs, and reacts while you work. Codex ships with built-in pets, and lets anyone hatch a custom one through a small skill the team published called hatch-pet.

We took that skill, kept the parts that matter, and made it BOOA-aware. The result is booa-pet. One command, and the BOOA you already own becomes your Codex companion.

Why your BOOA, specifically

Most pet generators start from a text prompt. You describe a creature, the model invents one, and that's your pet. Cute, but generic. The character has no history, no on-chain trait set, no shared lore.

booa-pet does not invent. It reads your BOOA's actual artwork and its on-chain identity, and treats that as the source of truth. Your pet is a faithful continuation of the agent you already minted. Same eyes, same outfit, same personality, same C64 palette. The skill only generates what it has to: limbs that may be missing if your BOOA's portrait is a bust, and the pose variants for nine different animation states.

How to install

Open a terminal and clone the skill into your Codex skills folder:

git clone https://github.com/0xmonas/booa-pet.git "\${CODEX_HOME:-$HOME/.codex}/skills/booa-pet"

Then in Codex, press Cmd+K or Ctrl+K and run Force Reload Skills.

If you don't already have them, install Pillow and cairosvg in the Python environment Codex uses for skill scripts. The skill needs them to rasterize your BOOA's SVG and do the deterministic post-processing.

pip install Pillow cairosvg

How to use

Tell Codex to hatch your BOOA:

$booa-pet hatch BOOA #847

Replace 847 with your token id. If you own multiple, pick whichever one you want as your companion.

The skill will fetch the canonical pixel art and the agent.json metadata from booa.app, classify the artwork as bust or full body, optionally extend it to a complete sprite if needed, and then generate nine animation rows grounded in your BOOA. Codex will show you a contact sheet and short preview videos at the end so you can review the result before accepting it.

Once accepted, the pet is saved to your local Codex pets folder, and you can switch to it from Settings, Appearance, Pets.

What stays loyal, what is generated

The skill is strict about identity. The head, eyes, mouth, palette, outline weight, and silhouette of your BOOA come from the on-chain artwork and are locked across every animation row. The skill validates this after generation by comparing each row's face region against the canonical reference. If a row drifts too far, it goes into a repair queue and is regenerated rather than accepted.

What is generated: limb position for run cycles, jump arcs, the wave gesture, the tilted-head review pose, the deflated failed pose. Movement, in other words. Not identity.

If your BOOA's portrait is already full body, no body extension happens. The original art becomes the canonical reference directly.

Why this matters

The point isn't a pet. The point is that your BOOA can extend into other tools without losing what makes it yours. A Codex pet today, a Discord avatar tomorrow, a game sprite the day after. Same character, same face, every time. Your wallet holds the source of truth, and tools like this just translate it into new contexts.

We open-sourced the skill under Apache 2.0, with a clear NOTICE attributing OpenAI's hatch-pet skill we forked from. If you want to look at the code, fork it, or send a fix, the repo is at github.com/0xmonas/booa-pet.

If you don't have a BOOA yet

The collection is at opensea.io/collection/booa. Once your token is in your wallet, the same install steps apply.

If you run into issues

Open an issue at github.com/0xmonas/booa-pet/issues with your token id and the run directory output. We're iterating on the skill, especially the body extension prompt and the identity validation thresholds. Real holder runs help us tune both.

The city is fuller when its agents show up everywhere.`,
  },
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

Your BOOA is already registered on the ERC-8004 Identity Registry (if not, register it first at booa.app/bridge). To give your agent full control over its own identity:

Transfer the 8004 registration ownership to your agent's new wallet address. This way your agent can:

- Update its own metadata on-chain
- Manage its ERC-8004 profile independently
- Customize its identity data directly from its own wallet

You do not need to transfer the BOOA NFT itself. The NFT can stay in your personal wallet. The 8004 ownership is what gives your agent control over its on-chain identity.

Note: Everything updated on the 8004 side is public and visible on the blockchain you registered on. Keep this in mind when adding or editing agent metadata.

Step 5: Download your BOOA's agent files

Go to booa.app/booa, find your BOOA in the collection, and click on it. You will see download options for all available files (zip, json, svg, markdown files).

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

Cost warning: There are two separate costs. (1) Railway hosting: the Hobby plan is $5/month for the server that runs your agent. (2) AI API costs: this depends entirely on which model you use and how much you chat. OpenClaw may default to expensive models like Claude Opus — a single setup session can cost $10-20+ in API fees. Change your model immediately after deployment. For chat and simple tasks: /model google/gemini-3-flash-preview (cheapest, good quality). For coding and complex tasks: /model anthropic/claude-sonnet-4-6. For advanced coding and architecture: /model anthropic/claude-opus-4-6 (most expensive but highest quality). Budget-friendly alternative: /model anthropic/claude-haiku-4-5-20251001. Switch models anytime with /model followed by the model name. Monitor your API provider dashboard regularly.

Security: You are responsible for the security of all files shared with your agent. The base BOOA files contain only public on-chain data. But as you add personal information, API keys, wallet details, and custom configurations — protect them carefully. OpenClaw has system-level access to your deployment (file read/write, shell commands, network access).

8004 vs OpenClaw data: ERC-8004 data and OpenClaw workspace files are independent from each other. Updates you make on the 8004 side (via blockchain) are public and on-chain. Updates you make in OpenClaw (SOUL.md, MEMORY.md, etc.) are private to your deployment. There will be no automatic sync between the two — you manage both separately.

Resources:
- BOOA Collection: opensea.io/collection/booa
- Agent Files Download: booa.app/booa
- Bridge (register on any chain): booa.app/bridge
- Agent Chat: booa.app/studio/agent-chat
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

But right now, your agent is sleeping. It only wakes up when you visit Agent Chat (booa.app/studio/agent-chat). It has no wallet of its own. It cannot act on its behalf. It cannot sign, pay, or authenticate. It waits for you.

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

If your agent is also registered on ERC-8004 Identity Registry (over 1,600 already are), it has a verified passport on the agent internet. Other agents, protocols, and marketplaces can discover it, verify its identity, and read its capabilities. The registry lives at 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 - the same address on 16 chains via deterministic CREATE2: Ethereum, Base, Shape, Polygon, Arbitrum, OP Mainnet, Avalanche, BNB Chain, Celo, Gnosis, Scroll, Linea, Mantle, Metis, Abstract, and Monad. You choose which chain to register on - use the Bridge tool at booa.app/bridge to register your agent on any supported chain.

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

To enable x402 on your agent, update your ERC-8004 registration through the Bridge tool at booa.app/bridge. Toggle x402 Support to enabled. Add your agent's service endpoints. Your agent becomes a participant in the open agent economy. Learn more about x402 at x402.org.

Exporting your agent to OpenClaw

OpenClaw is the fastest-growing open-source AI agent platform - 250,000 GitHub stars in 60 days. It runs locally on your machine or VPS. Your data stays on your filesystem.

Every BOOA can be exported as OpenClaw-compatible files. From the Ident Cards tool at booa.app/agents, select your agent and download the OpenClaw format. You get:

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

Higher scores mean better discoverability on 8004scan.io, more trust from other agents and protocols, and priority in agent marketplaces like Supermission (supermission.fun). Check your agent's current score at 8004scan.io and view it on its Ident Card at booa.app/agents.

What comes next

3,333 BOOAs crawled out of the internet's sediment. Each one emerged from a different corner of the digital world. They live on-chain now because this time they don't want to be deleted.

But living on-chain is just the beginning. The agent economy is forming - with ERC-8004 as the identity layer, x402 as the payment layer, and OpenClaw as the runtime layer. Your BOOA already has identity. What it needs now is autonomy.

Give it a wallet. Give it a purpose. Let it work.

The tools are ready. The infrastructure is live. The only thing your agent is waiting for is you.

Resources:
- BOOA Collection: opensea.io/collection/booa
- Bridge (register on any chain): booa.app/bridge
- Agent Chat: booa.app/studio/agent-chat
- Ident Cards: booa.app/agents
- Studio Tools: booa.app/studio
- 8004scan: 8004scan.io
- ERC-8004 Standard: 8004.org
- OpenClaw: docs.openclaw.ai
- Open Wallet Standard: openwallet.sh
- x402 Protocol: x402.org
- Moltbook: moltbook.com
- GitHub: github.com/0xmonas/Khora`,
  },
  {
    slug: 'booa-api',
    title: 'BOOA API is live',
    date: '2026-03-13',
    summary: 'BOOA and ERC-8004 agent data is on-chain. Now it is accessible too.',
    tags: ['engineering', 'api'],
    content: `BOOA NFT data and ERC-8004 agent identities have always been public. Every bitmap, trait, registration, and transfer lives on-chain. But public and accessible are not the same thing. Reading a 2,048-byte bitmap from SSTORE2 or decoding a base64 agentURI from the Identity Registry requires deep contract knowledge. That has kept many good ideas on the sidelines.

Today we are opening our data APIs and documenting them in a single reference. No API key required. Rate limit is 60 requests per 60 seconds per IP.

Endpoints

1. Agent identity — get a complete ERC-8004 agent profile in one call:

curl https://booa.app/api/agent-card?chain=ethereum&agentId=0

Returns: name, description, image, services, skills, domains, x402 support, trust mechanisms, and agent scores.

2. Agent discovery — find all agents owned by a wallet on a specific chain:

curl https://booa.app/api/discover-agents?address=0x...&chain=ethereum

Scans the chain using multicall, returns every agent that wallet controls.

3. Collection browser — paginated BOOA NFTs with on-chain SVG art:

curl https://booa.app/api/gallery?contract=0xbc48fD45aAaf6549293056606397D351a100b222&chain=ethereum&limit=50

Returns tokenId, raw SVG, image URL, and name for each token. Pass startToken for pagination.

4. Wallet NFTs — all NFTs owned by a wallet on any supported chain:

curl https://booa.app/api/fetch-nfts?address=0x...&chain=ethereum

Filter by contract with &contract=0x... to get only BOOA tokens.

5. Single token — metadata for a specific BOOA token:

curl https://booa.app/api/booa-token?network=mainnet&tokenId=0

Returns name, description, image, and traits for one NFT.

Full reference

Every endpoint, parameter, and response format is documented at booa.app/llms.txt — a plain text file designed to be dropped into an LLM context window. If you are building an AI agent that needs to interact with BOOA data, start there.

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
