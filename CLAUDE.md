# Khôra — CLAUDE.md

## Project
AI agent identity generator + on-chain registry. Mint AI-generated agents as NFTs on Shape Network, register on ERC-8004 Identity Registry across 20+ EVM chains.

## Tech Stack
- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind CSS, wagmi v2, viem, RainbowKit
- **Contracts:** Solidity, Foundry (`~/.foundry/bin/forge`, `~/.foundry/bin/cast`)
- **AI:** Google Gemini (agent gen), Replicate (pixel art)
- **Auth:** SIWE + iron-session
- **DB/Cache:** Upstash Redis (rate limiting + metadata cache)
- **Font:** Departure Mono (`--font-departure-mono`)

## Commands
```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # ESLint

# Contracts (from repo root)
cd contracts && ~/.foundry/bin/forge build    # Build contracts
cd contracts && ~/.foundry/bin/forge test     # Run tests
```

## Key Conventions
- Turkish language for user communication
- Nav label: "Ident Cards" (not "Agents")
- `renounceOwnership()` disabled on all contracts: `revert("Cannot renounce")`
- TESTNET_IDS pattern for registry address selection
- Design system: retro Blade Runner / C64 terminal aesthetic
- Buttons: `border-2 border-neutral-700 dark:border-neutral-200`
- Path alias: `@/*` → `./src/*`

## Structure
```
src/
  app/           # Pages + API routes
  components/
    features/    # Generator, Bridge
    layouts/     # Header, Footer
    providers/   # Web3, Theme, SIWE
    ui/          # Primitives (shadcn-style)
  lib/
    contracts/   # ABIs, addresses
    server/      # Server-side utils
  types/         # TypeScript types
  utils/         # Helpers, scoring, constants
  hooks/         # Custom React hooks
contracts/       # Foundry project (v2 system)
```

## ERC-8004 Registry
- Mainnet: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- Testnet: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- Deterministic CREATE2 — same address on all EVM chains
