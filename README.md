# Khôra

On-chain AI agent generator on Shape. Create, mint, and register AI agents with fully on-chain pixel art and identity — powered by ERC-8004.

![logo](https://github.com/user-attachments/assets/bb73db4c-1f64-4e64-8f32-bc0c6ad17ae6)

## What is Khôra?

Khôra generates complete AI agent identities — personality, skills, boundaries, domains — and mints them as fully on-chain NFTs on Shape Network. Portraits are AI-generated pixel art stored directly in the smart contract via SSTORE2, with no external dependencies.

Agents can optionally be registered on the [ERC-8004 Identity Registry](https://eips.ethereum.org/EIPS/eip-8004), making them discoverable across 16 EVM chains.

## Features

- **AI Agent Generation** — AI generates complete agent profiles (creature, vibe, personality, skills, domains, boundaries)
- **AI Pixel Art Portraits** — AI-generated portraits processed through C64 16-color palette quantization and pixel stretch
- **Fully On-Chain** — SVG art + JSON traits stored via SSTORE2, no IPFS or external hosting
- **Signature-Based Minting** — Server-signed mint packets with deadline verification
- **ERC-8004 Identity Registry** — Register agents on-chain for cross-ecosystem discoverability across 16 chains
- **Create Mode** — Generate a completely random, unique AI agent from scratch
- **Import Mode** — Discover your existing agents across 16 chains and reimagine them with new art
- **Multiple Export Formats** — PNG, SVG, ERC-8004 JSON
- **Cross-Chain Bridge** — Bridge agent identities across supported EVM chains

## How It Works

### Create Mode
1. **Generate** — AI creates a full agent identity + pixel art portrait
2. **Mint** — Server signs the mint packet, NFT is minted with on-chain SVG + traits
3. **Register** *(optional)* — Register on ERC-8004 Identity Registry

### Import Mode
1. **Discover** — Scan 16 chains for your existing ERC-8004 agents
2. **Select** — Pick an agent to reimagine
3. **Mint** — Generate new pixel art and mint as BOOA V2 NFT
4. **Update** — Update the existing registry entry with the new identity

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | Shape Network (mainnet: 360, testnet: 11011) |
| Smart Contracts | Solidity 0.8.24, SSTORE2, Foundry |
| Standards | ERC-721, ERC-2981, ERC-8004 |
| Frontend | Next.js 15, React 19, TypeScript |
| Web3 | wagmi v2, viem, RainbowKit |
| AI | Gemini (text), Replicate (image) |
| UI | Tailwind CSS, Departure Mono |
| Auth | SIWE + Iron-Session |
| Rate Limiting | Upstash Redis |

## Smart Contracts: BOOA V2

**BOOA V2** is a 4-contract system on Shape Network:

| Contract | Role |
|----------|------|
| BOOAv2 | ERC-721 + ERC-2981 NFT core |
| BOOAStorage | On-chain SVG + traits via SSTORE2 |
| BOOARenderer | Token URI + metadata generation |
| BOOAMinter | Signature-verified minting + phases |

Features:
- On-chain SVG storage via SSTORE2 (max 24KB per token)
- On-chain JSON traits storage (max 8KB per token)
- Server-signed mint packets with deadline expiry
- SVG sanitization (blocks scripts, iframes, event handlers)
- Configurable mint price, max supply (3,333), and phases
- Full royalty support (ERC-2981)

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Fill in your API keys

# Run development server
npm run dev
```

### Contract Deployment

```bash
cd contracts
~/.foundry/bin/forge build
~/.foundry/bin/forge test
```

## Environment Variables

| Variable | Description |
|----------|------------|
| `GEMINI_API_KEY` | Google Gemini API key |
| `REPLICATE_API_TOKEN` | Replicate API token |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | WalletConnect project ID |
| `NEXT_PUBLIC_BOOA_V2_ADDRESS_TESTNET` | BOOA V2 contract (Shape Sepolia) |
| `NEXT_PUBLIC_BOOA_V2_MINTER_ADDRESS_TESTNET` | Minter contract (Shape Sepolia) |
| `UPSTASH_REDIS_REST_URL` | Upstash Redis URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis token |
| `SESSION_SECRET` | Iron-session secret (32+ chars) |
| `SIGNER_PRIVATE_KEY` | Mint packet signer key |
| `DEPLOYER_PRIVATE_KEY` | Contract deployer key |

## Links

- **App**: [khora.fun](https://khora.fun)
- **GitHub**: [github.com/0xmonas/Khora](https://github.com/0xmonas/Khora)
- **ERC-8004**: [eips.ethereum.org/EIPS/eip-8004](https://eips.ethereum.org/EIPS/eip-8004)

## License

Open source. Built by [0xmonas](https://github.com/0xmonas).
