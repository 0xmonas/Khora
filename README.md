# Khôra

On-chain AI agent generator on Base. Create, mint, and register AI agents with fully on-chain pixel art and identity — powered by ERC-8004.

![logo](https://github.com/user-attachments/assets/bb73db4c-1f64-4e64-8f32-bc0c6ad17ae6)

## What is Khôra?

Khôra turns a name and description into a complete AI agent identity — personality, skills, boundaries, domains — and mints it as a fully on-chain NFT on Base. Portraits are AI-generated pixel art stored directly in the smart contract via SSTORE2, with no external dependencies.

Agents can optionally be registered on the [ERC-8004 Identity Registry](https://eips.ethereum.org/EIPS/eip-8004), making them discoverable across the agent ecosystem.

## Features

- **AI Agent Generation** — Gemini generates complete agent profiles (creature, vibe, personality, skills, domains, boundaries) from just a name and description
- **AI Pixel Art Portraits** — Gemini image model generates portraits, processed through C64 16-color palette quantization and pixel stretch
- **Fully On-Chain** — SVG art + JSON traits stored via SSTORE2, no IPFS or external hosting
- **Commit-Reveal Minting** — Front-running resistant two-step mint on Base
- **ERC-8004 Identity Registry** — Register agents on-chain for cross-ecosystem discoverability
- **Import & Update** — Discover existing agents across 10 chains and update their identity with new art
- **Multiple Export Formats** — PNG, SVG, ERC-8004 JSON, OpenClaw ZIP
- **OASF Taxonomy** — Skills and domains follow the Open Agent Service Framework v0.8.0

## How It Works

### Create Mode
1. **Commit** — Reserve a mint slot on the BOOA contract (pays mint price)
2. **Generate** — AI creates the full agent identity + pixel art portrait
3. **Reveal** — SVG and traits are written on-chain
4. **Register** *(optional)* — Register on ERC-8004 Identity Registry

### Import Mode
1. **Discover** — Scan 10 chains for your existing ERC-8004 agents
2. **Select** — Pick an agent to reimagine
3. **Mint** — Generate new pixel art and mint as BOOA NFT
4. **Update** — Update the existing registry entry with the new identity

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | Base (Ethereum L2) |
| Smart Contracts | Solidity 0.8.24, SSTORE2, Hardhat |
| Standards | ERC-721, ERC-2981, ERC-8004 |
| Frontend | Next.js 15, React 18, TypeScript |
| Web3 | wagmi, viem, RainbowKit |
| AI | Google Gemini (agent + image generation) |
| UI | Radix UI, Tailwind CSS, Departure Mono |
| Backend | Upstash Redis, Iron-Session (SIWE) |
| Taxonomy | OASF v0.8.0 |

## Smart Contract: BOOA

**BOOA by Khora** is an ERC-721 + ERC-2981 NFT contract on Base with:

- On-chain SVG storage via SSTORE2 (max 24KB per token)
- On-chain JSON traits storage (max 8KB per token)
- Commit-reveal minting pattern (7-day reveal deadline)
- SVG sanitization (blocks scripts, iframes, event handlers)
- Configurable mint price, max supply, and per-wallet limits
- Full royalty support (ERC-2981)

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Fill in your API keys (GEMINI_API_KEY, etc.)

# Run development server
npm run dev
```

### Contract Deployment

```bash
cd contracts
npm install
npx hardhat compile
npx hardhat run scripts/deploy.ts --network baseSepolia
```

## Environment Variables

| Variable | Description |
|----------|------------|
| `GEMINI_API_KEY` | Google Gemini API key |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect project ID |
| `NEXT_PUBLIC_BOOA_NFT_ADDRESS_TESTNET` | BOOA contract address (Base Sepolia) |
| `NEXT_PUBLIC_BOOA_NFT_ADDRESS` | BOOA contract address (Base mainnet) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token |
| `SESSION_SECRET` | Iron-session secret (32+ chars) |
| `DEPLOYER_PRIVATE_KEY` | Contract deployer private key |

## Links

- **App**: [khora.fun](https://khora.fun)
- **GitHub**: [github.com/0xmonas/Khora](https://github.com/0xmonas/Khora)
- **ERC-8004**: [eips.ethereum.org/EIPS/eip-8004](https://eips.ethereum.org/EIPS/eip-8004)

## License

Open source. Built by [0xmonas](https://github.com/0xmonas).
