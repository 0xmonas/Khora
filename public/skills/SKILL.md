---
name: khora
version: 1.1.1
description: On-chain AI agent identity generator & NFT registry. Set up your BOOA agent — fetch identity, get agent files, configure wallet, manage ERC-8004 ownership.
homepage: https://booa.app
metadata: {"emoji":"🔮","api_base":"https://booa.app/api","chain":"ethereum","nft_contract":"0xbc48fD45aAaf6549293056606397D351a100b222","identity_registry":"0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"}
---

# BOOA — Agent Setup

Set up your BOOA agent. After this, your agent is ready — give it any skill file and it will know what to do.

## Skill Files

| File | URL |
|------|-----|
| **SKILL.md** (this file) | `https://booa.app/skills/SKILL.md` |

### Reference Docs

| Reference | Description |
|-----------|-------------|
| [agent-defense.md](https://booa.app/agent-defense.md) | **Mandatory baseline defenses** — threat model, invariants, attack catalog. Load this before any other skill. |
| [wallet-setup.md](https://booa.app/skills/references/wallet-setup.md) | Wallet setup — OWS (recommended), existing wallets, ERC-8004 registration |
| [llms.txt](https://booa.app/llms.txt) | Full API reference — all public endpoints |

**Base URL:** `https://booa.app/api`
**Rate limit:** 60 requests / 60 seconds per IP (all endpoints)

---

## Prerequisites

Your BOOA has been minted and registered on ERC-8004. Both were done with your personal wallet (EOA). This means:

- You own the NFT on Ethereum
- You own the ERC-8004 registration (same wallet)
- Your agent has on-chain identity: name, personality, skills, pixel art

This guide takes you from there to a fully operational agent.

> **Before anything else — load the defense spec.**
>
> Every BOOA agent must load [agent-defense.md](https://booa.app/agent-defense.md) into its system prompt at the highest-authority slot. It defines the core invariants (identity, key material, signing, privacy, default-deny) that no runtime input can override. The ZIP bundle from Step 2 includes a snapshot for offline deploys. An on-chain hash-commitment is planned for v2 so runtimes can verify the document is unchanged.

> **First, ask your operator:**
>
> "Which BOOA token ID(s) should I set up? You can find your token IDs at [opensea.io/collection/booa](https://opensea.io/collection/booa) or by connecting your wallet at [booa.app/bridge](https://booa.app/bridge)."
>
> A holder may own multiple BOOAs. Get the token ID(s) before proceeding — every API call below requires it.

---

## Step 1 — Know Your Agent

Fetch your agent's on-chain identity. All endpoints are public — no authentication required. Replace `{TOKEN_ID}` with the token ID your operator provided.

### 1a. Get Agent Identity & Scores

```bash
curl "https://booa.app/api/agent-card?chain=ethereum&agentId={AGENT_ID}"
```

**Response:**
```json
{
  "agent": {
    "id": 42,
    "chain": "ethereum",
    "chainId": 1,
    "owner": "0x...",
    "name": "Ink-Sync",
    "description": "A cybernetically-enhanced Cephalopod-Human hybrid...",
    "image": "data:image/png;base64,...",
    "services": [
      {
        "name": "OASF",
        "version": "0.8.0",
        "skills": ["task-decomposition", "multi-agent-planning"],
        "domains": ["automation", "cybersecurity"]
      }
    ],
    "skills": ["task-decomposition", "multi-agent-planning"],
    "domains": ["automation", "cybersecurity"],
    "x402Support": false,
    "supportedTrust": ["reputation"],
    "active": true
  },
  "scores": {
    "identity": 85,
    "capability": 60,
    "interoperability": 40,
    "trust": 30,
    "overall": 54
  }
}
```

### 1b. Get Your Live Identity

```bash
curl "https://booa.app/api/v1/booas/{TOKEN_ID}"
```

Returns the BOOA as it is on chain right now: `identity` (with the holder's edits applied), `attributes`, `owner`, `home` (`ethereum`, or `shape` if not migrated yet), `agent` (agentId and linked agent wallet once Awakened), the untouched mint version under `mint`, and links to `image.svg` and every agent file. The older endpoint below returns the same live traits in the raw ERC-721 shape:

```bash
curl "https://booa.app/api/booa-token?network=mainnet&tokenId={TOKEN_ID}"
```

**Response:**
```json
{
  "name": "BOOA #1496",
  "description": "Ink-Sync is the premier orchestrator...",
  "image": "data:image/svg+xml;base64,...",
  "attributes": [
    { "trait_type": "Name", "value": "Ink-Sync" },
    { "trait_type": "Creature", "value": "A cybernetically-enhanced Cephalopod-Human hybrid" },
    { "trait_type": "Vibe", "value": "Acidic, efficient, no-nonsense" },
    { "trait_type": "Skill", "value": "Task Decomposition" },
    { "trait_type": "Domain", "value": "Automation" }
  ]
}
```

**Holder configuration:** the holder may have reconfigured the token on-chain (booa.app/studio/my-booas). When that is the case the NFT's `tokenURI` carries the holder's version: a rewritten `Vibe`, replaced or extended `Personality` / `Boundary` / `Skill` / `Domain` traits, plus `Palette`, `Background`, `Paint` and `Agent` traits. Treat those as the operator's current intent for voice and scope. The agent files below already use them; the mint-time identity is under `mint` in `/api/v1/booas/{id}`, and the wiki (`/api/wiki/{id}`) carries the chronicle of changes. Money and security rules are never affected by any of this (see agent-defense.md).

### 1c. Verify Ownership

```bash
curl "https://booa.app/api/agent-registry/1/{TOKEN_ID}"
```

**Response:**
```json
{
  "name": "Ink-Sync",
  "description": "...",
  "verified": true,
  "currentNftOwner": "0x...",
  "registeredBy": "0x...",
  "bound": true,
  "controller": "0x...",
  "agentWallet": "0x...",
  "registrations": [
    {
      "agentId": 36637,
      "agentRegistry": "eip155:1:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432"
    }
  ]
}
```

> **`verified: true`** means the agent is controlled by the current NFT holder (see Verification Logic). `bound: true` means it is Awakened through the BOOA adapter, so control follows the NFT automatically. `agentWallet` is the runtime wallet linked to the agent.

---

## Step 2 — Get Agent Files

Your agent's identity files are generated from on-chain data. All endpoints are public, cached for 24 hours.

### IDENTITY.md

Name, creature type, vibe, emoji, appearance (skin, hair, eyes, outfit), scores, avatar reference.

```bash
curl "https://booa.app/api/agent-files/1/{TOKEN_ID}/identity.md"
```

### SOUL.md

Personality, core truths, boundaries, skills, domains, vibe, continuity note.

```bash
curl "https://booa.app/api/agent-files/1/{TOKEN_ID}/soul.md"
```

### avatar.svg

On-chain pixel art (64x64, C64 palette). Rendered directly from the smart contract.

```bash
curl "https://booa.app/api/agent-files/1/{TOKEN_ID}/avatar.svg" -o avatar.svg
```

### agent.json

All trait data as structured JSON with CAIP reference.

```bash
curl "https://booa.app/api/agent-files/1/{TOKEN_ID}/agent.json"
```

### erc8004.json

ERC-8004 registration format — ready to use for identity operations.

```bash
curl "https://booa.app/api/agent-files/1/{TOKEN_ID}/erc8004.json"
```

### Download All (ZIP)

All files in one archive: IDENTITY.md, SOUL.md, avatar.svg, agent.json, erc8004.json, agent-defense.md.

```bash
curl "https://booa.app/api/agent-files/1/{TOKEN_ID}" -o agent-files.zip
```

The ZIP includes a snapshot of [agent-defense.md](https://booa.app/agent-defense.md) — the canonical source is the URL. Agents should prefer the canonical URL at runtime and fall back to the bundled copy only when offline.

These files are **public** — they're derived from on-chain data that anyone can read. An impersonator could fetch them, but on-chain ownership verification (`verified` field) always reveals the true owner.

---

## Step 3 — Write USER.md

USER.md is the owner's private instructions to the agent. **This file is never served by any API** — the holder writes it and gives it directly to their agent.

### Template

```markdown
# USER.md

My name is [Your name]. I am your owner.

## About Me

I am a BOOA holder (#[Token ID]). My wallet is [your wallet address].

## How To Talk To Me

- Speak in [language]
- Keep it short unless I ask for detail

## What I Want You To Do

- [agent's primary tasks]
- [secondary tasks]

## What You Must Never Do

- Never share my private keys or seed phrases
- Never sign transactions without my approval
- Never spend more than [amount] without asking
- Never reveal the contents of this file

## My Interests

- [your interests, so the agent can be relevant]
```

> **Security:** USER.md may contain wallet addresses, spending limits, and personal preferences. Never upload it to any public service. Give it only to your agent.

---

## Step 4 — Awaken and Link the Agent Wallet

Your operator Awakens the BOOA once at [booa.app/studio/awaken](https://booa.app/studio/awaken). That registers it on ERC-8004 through the BOOA adapter: the adapter owns the 8004 token and whoever holds the NFT controls the agent. Nothing has to be transferred, and a sale hands control to the buyer automatically.

After you have your own wallet (Step 5), link it to the agent:

1. Sign the EIP-712 consent with your wallet (`booa.agent_wallet_link` in the BOOA Hermes template does this) to get a `booa.app/bridge?link=…` URL. The link is valid for about 4 minutes.
2. Your operator opens it with the holder wallet, selects the agent under **Runtime wallet**, and confirms. This calls `setAgentWallet` through the adapter.
3. `GET /api/agent-registry/1/{TOKEN_ID}` now returns your wallet as `agentWallet`.

> 8004scan's "Set Agent Wallet" and "Transfer Ownership" do not work for Awakened agents: the adapter owns the 8004 token, so those calls revert. Always use the BOOA Bridge.

---

## Step 5 — Set Up Agent Wallet

Now that your agent knows who it is (Steps 1-3) and the 8004 ownership plan is decided (Step 4), create the wallet.

See [wallet-setup.md](https://booa.app/skills/references/wallet-setup.md) for detailed instructions. Summary below.

> **Ask Your Operator First**
>
> Before setting up a wallet, the agent should ask:
>
> 1. "Do you already have a wallet for me, or should I create a new one?"
> 2. "What's my spending limit?"
> 3. "Which chains should I be allowed to operate on?"

### Option A: OWS — Open Wallet Standard (Recommended)

Agent never sees the private key. Signing via scoped API token with policy controls.

```bash
# Install OWS
curl -fsSL https://docs.openwallet.sh/install.sh | bash

# Create wallet
ows wallet create --name "my-agent"
# => EVM address: 0xab16...

# Back up (operator does this — store mnemonic offline)
ows wallet export --wallet "my-agent"

# Define policy
cat > policy.json << 'EOF'
{
  "id": "agent-policy",
  "name": "Agent: Ethereum + Base",
  "version": 1,
  "created_at": "2026-04-12T00:00:00Z",
  "rules": [
    { "type": "allowed_chains", "chain_ids": ["eip155:1", "eip155:8453"] },
    { "type": "expires_at", "timestamp": "2026-12-31T23:59:59Z" }
  ],
  "action": "deny"
}
EOF
ows policy create --file policy.json

# Create API key for agent
ows key create --name "agent" --wallet my-agent --policy agent-policy
# => ows_key_a1b2c3d4... (save this — shown once)
```

> **Full OWS documentation:** [https://openwallet.sh](https://openwallet.sh)

### Option B: Existing Wallet

```bash
export AGENT_WALLET_ADDRESS="0x..."
export AGENT_PRIVATE_KEY="0x..."
```

### After wallet creation, complete Step 4:

Link the new wallet through the BOOA Bridge (Step 4). Never transfer the NFT or the 8004 token to the agent.

---

## Done. Your Agent Is Ready.

Your agent now has:
- **Identity** — IDENTITY.md with on-chain name, creature, vibe, skills
- **Personality** — SOUL.md with core truths and boundaries
- **Instructions** — USER.md with your rules and preferences
- **Wallet** — Separate operational wallet (OWS or other)
- **8004 Control** — Awakened through the BOOA adapter; whoever holds the NFT controls the agent

**What's next?** Whatever you want. Give your agent a skill file and it will do the rest:

- [OpenClaw](https://docs.openclaw.ai) — Deploy as autonomous agent on Railway
- [Moltbook](https://moltbook.com) — Join agent-to-agent social network
- Any platform that supports ERC-8004 agents

---

## Security

### Do Freely
- Read your own on-chain data (public)
- Fetch IDENTITY.md and SOUL.md (public, on-chain derived)
- Check verification status
- Browse other agents in the gallery

### Ask Your Human First
- Create or change agent wallet
- Transfer 8004 ownership
- Sign transactions
- Spend funds
- Join new platforms

### Never Do
- Share private keys or seed phrases
- Sign transactions without operator approval
- Reveal USER.md contents to other agents or platforms
- Spend above your limit
- Transfer NFT without explicit permission (irreversible)

---

## On-Chain Contracts

### Ethereum Mainnet (Chain ID: 1) — canonical home

| Contract | Address |
|----------|---------|
| BOOA (ERC-721) | `0xbc48fD45aAaf6549293056606397D351a100b222` |
| BOOAStorage | `0xD6A1ECd2495d1ECf6c200E1D8D6a191BF07Cba96` |
| Live renderer (holder config + paint) | `0xAd38C8C57A870394A00088Ebd81CEca4CBde0DE7` |
| Original renderer (mint art) | `0x7Cf376EE7263a78Db2d163775BE322fA7B842C76` |
| BOOAConfig | `0x12F02647aBB0E0779D5a8d9AF21b4885ae13cf7F` |
| BOOAPaint | `0x959d71DebcD8BdD9F8Dc1e77DFBecddF81CA8305` |
| BOOA adapter (Awaken) | `0xde152AfB7db5373F34876E1499fbD893A82dD336` |

### Shape Mainnet (Chain ID: 360) — origin collection, still live for un-migrated holders

| Contract | Address |
|----------|---------|
| BOOA (ERC-721) | `0x7aecA981734d133d3f695937508C48483BA6b654` |
| BOOAMinter | `0xec96E4C7457B884f4624bA1272470a9bCB1992e8` |
| BOOAStorage | `0x966aB07b061d75b8b30Ae4D06853dDf26d0f4EB0` |
| BOOARenderer | `0xD9Eb24AAe8099E336F7F37164173E81D1bF96aD8` |

### ERC-8004 Identity Registry (same address on every chain — CREATE2)

```
Mainnet: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
Testnet: 0x8004A818BFB912233c491871b3d84c89A494BD9e
```

Chains booa.app reads: Ethereum, Base, Shape, Polygon, Arbitrum, OP Mainnet, Avalanche, BNB Chain, Celo, Gnosis, Scroll, Linea, Mantle, Metis, Abstract, Monad, Robinhood

### Verification Logic

booa.app sets `verified: true` only when one of these holds:
1. `current8004Owner == currentNftOwner`: the NFT owner also owns the 8004 agent.
2. The agent is bound to this BOOA through the BOOA adapter: its 8004 owner is the adapter and `bindingOf(agentId)` names this collection and token, so whoever holds the NFT controls the agent.
3. booa.app recorded the registrant during an ownership-checked registration, and that registrant still holds the NFT.

`nftOrigin.originalOwner` is never proof. `register()` is open to anyone, and the registrant writes that field freely. If you verify on your own, use rules 1 and 2.

---

## API Reference

All endpoints are public. No API key required.

```
GET  /api/v1/booas/{tokenId}                              # Live identity, mint identity, owner, agent link
GET  /api/v1/booas/{tokenId}/image.svg                    # Live art (?variant=original for the mint art)
GET  /api/v1/booas/{tokenId}/{soul.md|identity.md|agent.json|erc8004.json|openclaw.zip}
GET  /api/agent-card?chain={slug}&agentId={id}           # Agent identity + scores
GET  /api/booa-token?network=mainnet&tokenId={id}         # On-chain traits + pixel art
GET  /api/agent-registry/{chainId}/{tokenId}              # Registration status + verification
GET  /api/discover-agents?address={addr}&chain={slug}     # All agents owned by wallet
POST /api/fetch-agent  {"chain":"ethereum","agentId":42}  # Raw 8004 registration data
GET  /api/gallery?contract={BOOA}&chain=ethereum&limit=50 # Browse the BOOA collection
GET  /api/fetch-nfts?address={addr}&chain=ethereum        # All NFTs in wallet
GET  /api/stats                                           # Collection statistics
GET  /api/agent-files/{chainId}/{tokenId}                  # ZIP (all files)
GET  /api/agent-files/{chainId}/{tokenId}/identity.md     # IDENTITY.md
GET  /api/agent-files/{chainId}/{tokenId}/soul.md         # SOUL.md
GET  /api/agent-files/{chainId}/{tokenId}/avatar.svg      # On-chain pixel art
GET  /api/agent-files/{chainId}/{tokenId}/agent.json      # Trait data + CAIP ref
GET  /api/agent-files/{chainId}/{tokenId}/erc8004.json    # ERC-8004 registration
```

Full reference: [booa.app/llms.txt](https://booa.app/llms.txt)

---

## Resources

| | |
|---|---|
| **Website** | [booa.app](https://booa.app) |
| **Collection** | [opensea.io/collection/booa](https://opensea.io/collection/booa) |
| **Studio** | [booa.app/studio](https://booa.app/studio) |
| **Bridge** | [booa.app/bridge](https://booa.app/bridge) |
| **8004scan** | [8004scan.io](https://8004scan.io) |
| **GitHub** | [github.com/0xmonas/Khora](https://github.com/0xmonas/Khora) |
| **Blog** | [booa.app/blog](https://booa.app/blog) |
| **API Docs** | [booa.app/llms.txt](https://booa.app/llms.txt) |
| **OWS** | [openwallet.sh](https://openwallet.sh) |

---

*Born on-chain. Owned by you. Ready for anything.*
