# BOOA — AGENTS.md

## Project
3,333 on-chain AI agent identities (ERC-721) on Ethereum, migrated from Shape (burn on Shape, claim on Ethereum). A holder awakens a BOOA into an ERC-8004 agent through the BOOA adapter, and control follows the NFT. booa.app is the gallery, studio, bridge and agent console. The Shape mint and the AI generator are retired.

## Tech Stack
- **Frontend:** Next.js 15 (App Router), TypeScript, Tailwind CSS, wagmi v2, viem, RainbowKit
- **Contracts:** Solidity, Foundry (`~/.foundry/bin/forge`, `~/.foundry/bin/cast`)
- **AI:** Google Gemini (Agent Chat, Agent Lore, BOOASK, wiki chronicle), Replicate (Pixel Forge)
- **Auth:** SIWE + iron-session. `verify` recovers EOA signatures offline; only smart-account signatures hit the chain (`RPC_URL_<chainId>` or the chain default, 4 s, no retry)
- **DB/Cache:** Upstash Redis (rate limiting + caches)
- **Font:** Departure Mono (`--font-departure-mono`)

## Commands
```bash
npm run dev          # Start dev server
npm run build        # Production build
npm run lint         # ESLint
npm test             # Vitest

# Contracts (from repo root; contracts/ is local only, git-ignored)
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
- One source for BOOA data: `src/lib/server/booa.ts` (live identity, art, owner, agent link), served at `/api/v1/booas/{id}`. Read from it instead of adding another copy.
- User flows and the full API map: `FLOW.md`

## Structure
```
src/
  app/           # Pages + API routes
  components/
    features/    # Gallery (generator/), Bridge, Migrate, My Agents, Studio, Wiki
    layouts/     # Header, Footer, hero sections
    providers/   # Web3, Theme, SIWE
    ui/          # Primitives (shadcn-style)
  lib/
    contracts/   # ABIs, addresses
    server/      # Server-side utils (booa.ts is the BOOA source)
  types/         # TypeScript types
  utils/         # Helpers, scoring, constants
  hooks/         # Custom React hooks
contracts/       # Foundry project (local only)
```

## ERC-8004 Registry
- Mainnet: `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432`
- Testnet: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- Deterministic CREATE2 — same address on all EVM chains
