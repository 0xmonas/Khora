╔══════════════════════════════════════════════════════════════════════╗
║                        BOOA AGENT GENERATOR                         ║
║                      Complete User Flow (V2)                        ║
╚══════════════════════════════════════════════════════════════════════╝


═══════════════════════════════════════════════════════════════════════
                          CREATE MODE
═══════════════════════════════════════════════════════════════════════

 ┌─────────────┐
 │  User lands  │
 │  on /create  │
 └──────┬──────┘
        │
        ▼
 ┌──────────────────────────────────────────┐
 │  INPUT FORM                              │
 │  ┌────────────────────────────────────┐  │
 │  │ Mode: [CREATE] [Import]            │  │
 │  ├────────────────────────────────────┤  │
 │  │ "AI generates everything — name,   │  │
 │  │  identity, and portrait.           │  │
 │  │  Just hit MINT."                   │  │
 │  ├────────────────────────────────────┤  │
 │  │ ▸ ERC-8004 Config (collapsed)     │  │
 │  │   • Services (web, A2A, MCP...)   │  │
 │  │   • Skills (OASF taxonomy)        │  │
 │  │   • Domains (OASF taxonomy)       │  │
 │  │   • x402 Payment (on/off)         │  │
 │  │   • Supported Trust               │  │
 │  │   (optional — if user sets these, │  │
 │  │    AI-generated values are NOT    │  │
 │  │    used for skills/domains)       │  │
 │  ├────────────────────────────────────┤  │
 │  │        [ MINT ]                    │  │
 │  │   0 minted / {price} ETH          │  │
 │  │   (price read from contract:      │  │
 │  │    testnet 0.00069, mainnet        │  │
 │  │    0.0069 public; owner=FREE)      │  │
 │  └────────────────────────────────────┘  │
 └──────────────────┬───────────────────────┘
                    │
                    │ click MINT
                    │ (requires: wallet connected + SIWE auth)
                    │ NO name/description input needed
                    ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │                      MINT FLOW MODAL                             │
 │  ┌────────────────────────────────────────────────────────────┐  │
 │  │ Step Indicators:                                           │  │
 │  │  [●] 1. Generate — AI creates your agent                  │  │
 │  │  [ ] 2. Confirm — Approve transaction in wallet            │  │
 │  │  [ ] 3. Complete — NFT minted                              │  │
 │  └────────────────────────────────────────────────────────────┘  │
 └──────────────────────────────────────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────────────────────────────────────────┐
        │  STEP 1: GENERATE (server-side, single API call)          │
        │                                                           │
        │  POST /api/mint-request                                   │
        │  ┌─────────────────────────────────────────────────────┐  │
        │  │ Server pipeline (all in one request):               │  │
        │  │                                                     │  │
        │  │ 1. Rate limit check:                                 │  │
        │  │    • Global daily cap (5000/day, hard stop)         │  │
        │  │    • IP rate limit (5 req/60s sliding window)       │  │
        │  │    • Per-wallet quota (6 total / 24h TTL)           │  │
        │  │                                                     │  │
        │  │ 2. Gemini → generate agent identity + portrait       │  │
        │  │    prompt + visual traits (SINGLE CALL)             │  │
        │  │    client: getAI() singleton                        │  │
        │  │    model: gemini-3.1-flash-lite-preview (temp: 1.0)│  │
        │  │    lore: "The Residue" (Khôra universe context)    │  │
        │  │    output: name, description, creature, vibe,       │  │
        │  │            emoji, personality[], boundaries[],      │  │
        │  │            skills[], domains[],                     │  │
        │  │            portraitPrompt, visualTraits              │  │
        │  │    (Hair, Eyes, Facial Hair, Mouth, Accessory,      │  │
        │  │     Headwear, Skin)                                 │  │
        │  │                                                     │  │
        │  │ 3. Replicate FLUX Dev + LoRA → generate image       │  │
        │  │    model: 0xmonas/y2 (H100, ~8s predict_time)      │  │
        │  │    params: 1:1 aspect, 28 steps, guidance 3.5      │  │
        │  │    output: PNG URL → download → base64              │  │
        │  │    download: 8 retries with increasing delay        │  │
        │  │    (3s, 5s, 7s...15s — replicate.delivery DNS)     │  │
        │  │                                                     │  │
        │  │ 4. Server-side pixelation + bitmap encoding         │  │
        │  │    • Downscale to 64x64                             │  │
        │  │    • C64 palette quantization (16 colors)           │  │
        │  │    • Encode as 2048-byte bitmap                     │  │
        │  │    (4 bits per pixel, 2 pixels per byte)            │  │
        │  │                                                     │  │
        │  │ 5. Build traits JSON (attributes array)             │  │
        │  │    • Agent traits (name, creature, vibe, etc.)      │  │
        │  │    • Visual traits (hair, eyes, skin, etc.)         │  │
        │  │    • Palette: C64                                   │  │
        │  │                                                     │  │
        │  │ 6. EIP-191 sign(imageData, traitsData,              │  │
        │  │              minter, deadline, chainId,             │  │
        │  │              minterContractAddress)                 │  │
        │  │    signer: server-side SIGNER_PRIVATE_KEY           │  │
        │  │    deadline: 10 minutes from now                    │  │
        │  │                                                     │  │
        │  │ 7. Increment wallet generation quota + daily cap     │  │
        │  │    (6 total per wallet / 24h, NO reset on mint)    │  │
        │  │    On AI failure: refund quota via DECR (never      │  │
        │  │    below 0) — user doesn't lose credits on errors  │  │
        │  └──────────────────┬──────────────────────────────────┘  │
        │                     │                                     │
        │  Response:          │                                     │
        │  {                  │                                     │
        │    imageData,       │  // 0x... hex (2048 bytes bitmap)   │
        │    traitsData,      │  // 0x... hex (JSON bytes)          │
        │    deadline,        │  // unix timestamp string           │
        │    signature,       │  // 0x... hex (EIP-191)             │
        │    agent,           │  // full agent object               │
        │    pixelatedImage,  │  // data:image/png;base64,...       │
        │    visualTraits,    │  // { Hair: "...", Eyes: "..." }    │
        │    quotaRemaining   │  // number                          │
        │  }                  │                                     │
        │                     │                                     │
        │  ████████████░░ 85.3%  (progress bar)                     │
        └─────────────────────┬─────────────────────────────────────┘
                              │
                              │ server responds with signed packet
                              ▼
        ┌───────────────────────────────────────────────────────────┐
        │  STEP 2: CONFIRM (wallet tx)                              │
        │                                                           │
        │  Client calls: minter.mint{value: mintPrice}(             │
        │    imageData,    // 2048-byte bitmap                      │
        │    traitsData,   // JSON bytes                            │
        │    deadline,     // signature expiry                      │
        │    signature,    // server EIP-191 signature              │
        │    merkleProof   // [] for public, proof for allowlist    │
        │  )                                                        │
        │  (Owner uses ownerMint — free, no phase/limit checks)     │
        │                                                           │
        │  ┌─────────────────────────────────────────────────────┐  │
        │  │ On-chain (BOOAMinter.sol):                          │  │
        │  │  1. Check: currentPhase != Closed                   │  │
        │  │     (Phases: Closed=0, Allowlist=1, Public=2)       │  │
        │  │  2. Check: block.timestamp <= deadline              │  │
        │  │  3. If Allowlist → verify merkleProof               │  │
        │  │  4. Check: msg.value >= price (phase-dependent)     │  │
        │  │  5. Check: mintCount[sender] < maxPerWallet         │  │
        │  │  6. Check: totalSupply < maxSupply                  │  │
        │  │  7. Check: signature not already used (replay)      │  │
        │  │  8. Verify EIP-191 signature from trusted signer    │  │
        │  │     (signs: imageData, traitsData, sender,          │  │
        │  │      deadline, chainId, address(this))              │  │
        │  │  9. booa.mint(sender) → ERC721 token                │  │
        │  │     └→ _update() hook: if gasbackEnabled,           │  │
        │  │        call gasbackAddress with gasToBurn            │  │
        │  │        (silent fail — never blocks transfer)        │  │
        │  │        ETH rebate received via receive()            │  │
        │  │ 10. store.setImageData(tokenId, bitmap) → SSTORE2   │  │
        │  │ 11. store.setTraits(tokenId, traitsJSON) → SSTORE2  │  │
        │  │ 12. emit AgentMinted(tokenId, sender)               │  │
        │  │ 13. Refund excess ETH (msg.value - price) if any    │  │
        │  └─────────────────────────────────────────────────────┘  │
        │                                                           │
        │  ● Waiting for wallet confirmation...                     │
        │  ● Transaction submitted, waiting for block...            │
        └─────────────────────┬─────────────────────────────────────┘
                              │
                              │ tx confirmed
                              ▼
        ┌──────────────────────────────────────────────────┐
        │  STEP 3: COMPLETE                                │
        │                                                  │
        │  Token ID: #0                                    │
        │  Mint tx: 0xabc...def  ↗                         │
        │  ✓ Agent minted successfully.                    │
        │                                                  │
        │  ─────────────────────────────────                │
        │  [ REGISTER ON AGENT PROTOCOL ]                  │
        │  "optional — gas only, no fee"                   │
        │                                                  │
        │  (user can close via X — no auto-close timer)    │
        │                                                  │
        │  On success: saves agent metadata to Upstash     │
        │  via POST /api/agent-metadata                    │
        │  (quota is NOT reset — 6 total per 24h)          │
        └───────────────────────┬──────────────────────────┘
                                │
                   ┌────────────┴────────────┐
                   │                         │
              skip (close X)           click REGISTER
                   │                         │
                   ▼                         ▼
        ┌──────────────────┐    ┌──────────────────────────────────┐
        │  Back to INPUT   │    │  REGISTERING                     │
        │  with agent data │    │                                  │
        │  panel showing:  │    │  Builds on-chain data URI:       │
        │  Can register    │    │  data:application/json;base64,   │
        │  later from      │    │                                  │
        │  Collection!     │    │  {                               │
        │                  │    │    "type": "https://eips...       │
        │  • name          │    │      eip-8004#registration-v1",  │
        │  • creature      │    │    "name": "MyAgent",            │
        │  • vibe          │    │    "description": "...",         │
        │                  │    │    "image": "data:image/          │
        │  • personality   │    │      png;base64,...",             │
        │  • skills        │    │    "services": [{                │
        │  • domains       │    │      "name":"OASF",              │
        │  • boundaries    │    │      "version":"0.8.0",          │
        │                  │    │      "skills":[...],             │
        │  Downloads:      │    │      "domains":[...]             │
        │  [PNG][SVG]      │    │    }],                            │
        │  [8004][Claw]    │    │    "active": false,               │
        │  [JSON]          │    │    "x402Support": false           │
        │                  │    │  }                               │
        │  [MINT AGAIN]    │    │                                  │
        │                  │    │  Calls: register(agentURI)       │
        │                  │    │  ● Waiting for confirmation...   │
        └──────────────────┘    └───────────────┬──────────────────┘
                                                │
                                                ▼
                                ┌──────────────────────────────────┐
                                │  REGISTER COMPLETE               │
                                │                                  │
                                │  Token ID: #0                    │
                                │  Registry ID: #7                 │
                                │  Register tx: 0xdef...456  ↗     │
                                │  ✓ Agent registered on ERC-8004  │
                                │  "discoverable on agent protocol"│
                                │                                  │
                                │  closing in 30s                  │
                                └──────────────────────────────────┘



═══════════════════════════════════════════════════════════════════════
                          IMPORT MODE
═══════════════════════════════════════════════════════════════════════

 ┌─────────────┐
 │  User lands  │
 │  on /create  │
 └──────┬──────┘
        │
        │ clicks "Import" tab
        ▼
 ┌──────────────────────────────────────────┐
 │  INPUT FORM                              │
 │  ┌────────────────────────────────────┐  │
 │  │ Mode: [Create] [IMPORT]            │  │
 │  └────────────────────────────────────┘  │
 │                                          │
 │  Wallet not connected?                   │
 │  → "Connect your wallet to discover      │
 │     your registered agents"              │
 └──────────────────┬───────────────────────┘
                    │
                    │ wallet connects
                    ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │  AUTO-DISCOVERY                                                  │
 │                                                                  │
 │  Frontend scans ALL chains in parallel:                          │
 │  GET /api/discover-agents?address=0x...&chain={chain}           │
 │  (one call per chain, Promise.allSettled)                       │
 │                                                                  │
 │  ┌────────────────────────────────────────────────────────────┐  │
 │  │  For each chain (16 chains in parallel):                   │  │
 │  │                                                            │  │
 │  │  Ethereum ──┐                                              │  │
 │  │  Base ──────┤                                              │  │
 │  │  Base Sep ──┤  1. balanceOf(address) → skip if 0           │  │
 │  │  Shape ─────┤  2. findMaxTokenId() → multicall probe       │  │
 │  │  Shape Sep ─┤  3. scanOwnedTokenIds() → parallel waves     │  │
 │  │  Polygon ───┤  4. tokenURI() batch → extract names         │  │
 │  │  Arbitrum ──┤     (data URI → base64 decode                │  │
 │  │  Optimism ──┤      OR http URI → fetch JSON)               │  │
 │  │  Avalanche ─┤                                              │  │
 │  │  BNB ───────┤                                              │  │
 │  │  Celo ──────┤                                              │  │
 │  │  Gnosis ────┤                                              │  │
 │  │  Scroll ────┤                                              │  │
 │  │  Linea ─────┤                                              │  │
 │  │  Mantle ────┤                                              │  │
 │  │  Metis ─────┤                                              │  │
 │  │  Abstract ──┤                                              │  │
 │  │  Monad ─────┘                                              │  │
 │  │                                                            │  │
 │  │  Uses chain-specific registry address:                     │  │
 │  │  • Mainnet: 0x8004A169...9a432  (all chains except        │  │
 │  │    testnets — TESTNET_IDS inverse pattern)                 │  │
 │  │  • Testnet: 0x8004A818...4BD9e  (base-sepolia,            │  │
 │  │    shape-sepolia)                                          │  │
 │  └────────────────────────────────────────────────────────────┘  │
 │                                                                  │
 │  "Scanning 16 chains..."  (animated)                             │
 └──────────────────────────┬───────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
           agents found            no agents
                │                       │
                │                       ▼
                │          ┌──────────────────────┐
                │          │ "No registered agents │
                │          │  found"               │
                │          │                       │
                │          │ [Enter manually] ─────┼──► MANUAL MODE
                │          └──────────────────────┘     (see below)
                ▼
 ┌──────────────────────────────────────────────────────────────┐
 │  AGENT DROPDOWN                                              │
 │  ┌────────────────────────────────────────────────────────┐  │
 │  │ Your Agents              [Enter manually]              │  │
 │  │ ┌──────────────────────────────────────────────────┐   │  │
 │  │ │ Select an agent...                           ▾   │   │  │
 │  │ │ ┌──── Base Sepolia ────────────────────────┐     │   │  │
 │  │ │ │  MyAgent (#9)                            │     │   │  │
 │  │ │ │  TestBot (#12)                           │     │   │  │
 │  │ │ ├──── Ethereum ────────────────────────────┤     │   │  │
 │  │ │ │  ProdAgent (#3)                          │     │   │  │
 │  │ │ │  Agent #7 (no metadata)                  │     │   │  │
 │  │ │ └─────────────────────────────────────────-┘     │   │  │
 │  │ └──────────────────────────────────────────────────┘   │  │
 │  └────────────────────────────────────────────────────────┘  │
 └──────────────────────────┬───────────────────────────────────┘
                            │
                            │ user selects an agent
                            ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │  FETCH & PRE-FILL (handleAgentSelect)                            │
 │                                                                  │
 │  1. setSelectedChain('base-sepolia')                             │
 │  2. setAgentId('9')                                              │
 │  3. setImportedRegistryTokenId(9)                                │
 │                                                                  │
 │  POST /api/fetch-agent { chain, agentId }                        │
 │  ┌────────────────────────────────────────────────────────────┐  │
 │  │ fetch-agent route:                                         │  │
 │  │  1. tokenURI(9) on correct registry (mainnet/testnet)      │  │
 │  │  2. Parse URI:                                             │  │
 │  │     • data:application/json;base64,... → decode            │  │
 │  │     • https://... → fetch JSON                             │  │
 │  │  3. Return { registration: { name, description,            │  │
 │  │     services, x402Support, supportedTrust, ... } }         │  │
 │  └────────────────────────────────────────────────────────────┘  │
 │                                                                  │
 │  Pre-fill form state:                                            │
 │  ┌────────────────────────────────────────────────────────────┐  │
 │  │ setAgentName(reg.name)                                     │  │
 │  │ setAgentDescription(reg.description)                       │  │
 │  │ setErc8004Services(reg.services)                           │  │
 │  │ setSelectedSkills(deduplicated from services)              │  │
 │  │ setSelectedDomains(deduplicated from services)             │  │
 │  │ setX402Support(reg.x402Support)                            │  │
 │  │ setSupportedTrust(reg.supportedTrust)                      │  │
 │  └────────────────────────────────────────────────────────────┘  │
 └──────────────────────────┬───────────────────────────────────────┘
                            │
                            ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │  PRE-FILLED FORM (editable)                                      │
 │  ┌────────────────────────────────────────────────────────────┐  │
 │  │ Mode: [Create] [IMPORT]                                   │  │
 │  ├────────────────────────────────────────────────────────────┤  │
 │  │ Your Agents: [MyAgent (#9) ▾]                              │  │
 │  ├────────────────────────────────────────────────────────────┤  │
 │  │ Agent name:  [MyAgent___________]  ◄── editable            │  │
 │  │ Description: [A helpful DeFi___]  ◄── editable             │  │
 │  ├────────────────────────────────────────────────────────────┤  │
 │  │ ▸ ERC-8004 Config (collapsed, user toggles)                │  │
 │  │   Services:                                                │  │
 │  │     [A2A] [https://agent.example/card.json] [x]           │  │
 │  │     [web] [https://myagent.com/____________] [x]           │  │
 │  │     [+ Add service]                                        │  │
 │  │                                                            │  │
 │  │   Skills: [3 selected]                                     │  │
 │  │     ▸ General ─── text-generation ✓, summarization ✓      │  │
 │  │     ▸ DeFi ────── swap-execution ✓                        │  │
 │  │                                                            │  │
 │  │   Domains: [1 selected]                                    │  │
 │  │     ▸ Finance ─── defi ✓                                  │  │
 │  │                                                            │  │
 │  │   x402: [off] [ON]                                         │  │
 │  │   Trust: [reputation ✓] [crypto-economic] [tee]            │  │
 │  ├────────────────────────────────────────────────────────────┤  │
 │  │        [ MINT ]                                            │  │
 │  │   (disabled until agentName is filled)                     │  │
 │  └────────────────────────────────────────────────────────────┘  │
 │                                                                  │
 │  User can edit ANY field before minting.                         │
 │  Changes will be reflected in the final on-chain data.           │
 └──────────────────────────┬───────────────────────────────────────┘
                            │
                            │ click MINT
                            ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │                      MINT FLOW MODAL                             │
 │  (same 3-step flow as CREATE mode)                               │
 │                                                                  │
 │  [●] 1. Generate                                                 │
 │  [ ] 2. Confirm                                                   │
 │  [ ] 3. Complete                                                  │
 │                                                                  │
 │  Same server-side pipeline: POST /api/mint-request               │
 │  AI generates a NEW portrait + identity regardless.              │
 │  User's ERC-8004 config (services, skills, domains)              │
 │  is merged — user picks override AI-generated values.            │
 └──────────────────────────┬───────────────────────────────────────┘
                            │
                            ▼
        (same GENERATE → CONFIRM → COMPLETE flow as CREATE)
                            │
                            ▼
        ┌──────────────────────────────────────────────────────────┐
        │  STEP 3: COMPLETE  (DIFFERENT from create!)              │
        │                                                          │
        │  Token ID: #1                                            │
        │  ✓ Agent minted successfully.                            │
        │                                                          │
        │  ─────────────────────────────────                        │
        │  [ UPDATE AGENT ON PROTOCOL ]         ◄── different!     │
        │  "updates your existing registry agent #9"               │
        │                                                          │
        └───────────────────────┬──────────────────────────────────┘
                                │
                                │ click UPDATE
                                ▼
        ┌──────────────────────────────────────────────────────────┐
        │  UPDATING (REGISTERING step)                             │
        │                                                          │
        │  Builds NEW on-chain data URI with:                      │
        │  • Updated name/description (user may have edited)       │
        │  • Pixelated image as data URI:                          │
        │    "data:image/png;base64,..."                           │
        │  • OASF version in semver: "0.8.0"                      │
        │  • OASF endpoint stripped if empty (WA009)              │
        │  • registrations[] with agentId + CAIP-2 registry       │
        │  • Current services/skills/domains/x402/trust            │
        │                                                          │
        │  Calls: setAgentURI(9, newDataURI)    ◄── NOT register! │
        │         (only owner can call this)                       │
        │                                                          │
        │  "Updating agent on Identity Registry..."                │
        │  Update tx: 0xabc...def  ↗                               │
        │  ● Waiting for confirmation...                           │
        └───────────────────────┬──────────────────────────────────┘
                                │
                                ▼
        ┌──────────────────────────────────────────────────────────┐
        │  UPDATE COMPLETE                                         │
        │                                                          │
        │  Token ID: #1  (BOOA NFT)                                │
        │  Registry ID: #9  (existing agent, same as before)       │
        │  Update tx: 0xdef...456  ↗                               │
        │  ✓ Agent updated on ERC-8004 protocol.                   │
        │  "Your agent metadata has been updated on-chain."        │
        │                                                          │
        │  closing in 30s                                          │
        └──────────────────────────────────────────────────────────┘



═══════════════════════════════════════════════════════════════════════
                      MANUAL ENTRY (Import sub-mode)
═══════════════════════════════════════════════════════════════════════

 ┌──────────────────────────────────────────────────────────────────┐
 │  User clicks "Enter manually" in import mode                     │
 │                                                                  │
 │  ┌────────────────────────────────────────────────────────────┐  │
 │  │ Chain:    [Base Sepolia ▾]      [Back to discovery]        │  │
 │  │ Agent ID: [9______________]                                │  │
 │  └────────────────────────────────────────────────────────────┘  │
 │                                                                  │
 │  • Sets importedRegistryTokenId on every keystroke               │
 │  • No auto-fetch of 8004 data (user types ID manually)          │
 │  • Once agentId is entered, name + description fields appear    │
 │  • User must fill name manually (required for MINT)             │
 │  • Same mint flow after clicking MINT                            │
 └──────────────────────────────────────────────────────────────────┘



═══════════════════════════════════════════════════════════════════════
                  COLLECTION → REGISTER (Post-Mint)
═══════════════════════════════════════════════════════════════════════

 User skipped registration after mint (closed modal at COMPLETE step).
 Later, they can register from the Collection detail view.

 ┌─────────────────────────────────────────────────────────────────┐
 │  COLLECTION GRID                                                │
 │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                          │
 │  │ #1   │ │ #0   │ │      │ │      │  ...                     │
 │  │ ████ │ │ ░░░░ │ │ ████ │ │ ░░░░ │                          │
 │  │(mine)│ │(mine)│ │      │ │      │                          │
 │  └──┬───┘ └──────┘ └──────┘ └──────┘                          │
 │     │                                                           │
 │  click on owned NFT                                             │
 └─────┼───────────────────────────────────────────────────────────┘
       │
       ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │  TOKEN DETAIL (agent #0)                                        │
 │                                                                 │
 │  ┌────────┐  MyAgent                                            │
 │  │  ████  │  dragon — cyberpunk                                 │
 │  │  ░░██  │  #0 (owned)                                         │
 │  │  ████  │  [OpenSea ↗] [OnChainChecker ↗]                    │
 │  └────────┘                                                     │
 │                                                                 │
 │  DESCRIPTION                                                    │
 │  A helpful DeFi agent that...                                   │
 │                                                                 │
 │  SKILLS                                                         │
 │  [text-generation] [summarization] [swap-execution]             │
 │                                                                 │
 │  DOMAINS                                                        │
 │  [defi] [finance]                                               │
 │                                                                 │
 │  DOWNLOAD                                                       │
 │  [JSON] [8004] [OpenClaw] [PNG] [SVG]                           │
 │                                                                 │
 │  ─────────────────────────────────────                          │
 │  [████████████] (skeleton while checking registry status)       │
 │  [ REGISTER ON AGENT PROTOCOL ]         ◄── only for owned!    │
 │  "gas only, no fee"                                             │
 │  (button hidden until registry check completes)                 │
 │                                                                 │
 └──────────────────────┬──────────────────────────────────────────┘
                        │
                        │ click REGISTER
                        ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │  REGISTERING...                                                 │
 │                                                                 │
 │  Data sources:                                                  │
 │  • Upstash metadata (if available) → full BooaAgent             │
 │  • On-chain traits (always available) → name, desc, skills...   │
 │  • On-chain pixelated image → image field                       │
 │                                                                 │
 │  Builds ERC-8004 JSON:                                          │
 │  {                                                              │
 │    "type": "...#registration-v1",                               │
 │    "name": "MyAgent",                                           │
 │    "image": "data:image/png;base64,...",                        │
 │    "services": [{ "name":"OASF", ... }],                       │
 │    "active": false                                              │
 │  }                                                              │
 │                                                                 │
 │  Calls: register(agentURI) → wallet popup                      │
 │  Register tx: 0xabc...def  ↗                                    │
 │  ● Waiting for confirmation...                                  │
 │                                                                 │
 │  Also saves registry data to backend:                           │
 │  POST /api/agent-registry/{chainId}/{tokenId}                   │
 │    { address, registryAgentId, txHash }                         │
 │    (backend verifies TX receipt on-chain before writing Redis)  │
 └──────────────────────┬──────────────────────────────────────────┘
                        │
                        ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │  REGISTERED ✓                                                   │
 │                                                                 │
 │  Registry ID: #7                                                │
 │  Register tx: 0xdef...456  ↗                                    │
 │  ✓ Agent registered on ERC-8004 protocol.                       │
 │                                                                 │
 │  (inline in token detail view, no modal)                        │
 └─────────────────────────────────────────────────────────────────┘

 Note: Non-owned tokens do NOT show the register button.
 Registration uses on-chain data directly (no re-minting needed).
 If user rejects wallet popup, returns to idle state silently.
 If tx fails, shows error + RETRY REGISTER button.



═══════════════════════════════════════════════════════════════════════
                    ON-CHAIN DATA ARCHITECTURE (V2)
═══════════════════════════════════════════════════════════════════════

 ┌─────────────────────────────────────────────────────────────────┐
 │                                                                 │
 │  V2 Contract Architecture (4 modular contracts)                 │
 │                                                                 │
 │  ┌───────────────────────────────────────────────────────────┐  │
 │  │  BOOAv2 (BOOA.sol) — Minimal ERC721 + ERC2981             │  │
 │  │  Shape Sepolia: 0x23e06B07...9D8dbF                       │  │
 │  │                                                           │  │
 │  │  • mint(to) → only authorized minters                    │  │
 │  │  • tokenURI(id) → delegates to Renderer                 │  │
 │  │  • Royalties: EIP-2981 (default 5%)                      │  │
 │  │  • No ERC721Enumerable (gas savings ~100K)               │  │
 │  └───────────────────────────────────────────────────────────┘  │
 │         ▲ mint()                    tokenURI() │               │
 │         │                                      ▼               │
 │  ┌──────┴────────────────────┐  ┌────────────────────────────┐ │
 │  │  BOOAMinter               │  │  BOOARenderer               │ │
 │  │  0xF4e1a6...38e649       │  │  0xB7d41D...98452AF         │ │
 │  │                           │  │                             │ │
 │  │  • Server-signed mint     │  │  • renderSVG(bitmap)        │ │
 │  │  • EIP-191 verification   │  │  • tokenURI() → JSON       │ │
 │  │  • Replay protection      │  │  • C64 16-color palette    │ │
 │  │  • Merkle allowlist phase │  │  • RLE path compression    │ │
 │  │  • Phase: Closed/AL/Pub  │  │  • DynamicBufferLib        │ │
 │  │  • maxPerWallet/maxSupply │  │                             │ │
 │  │  • ownerMint (free)       │  │                             │ │
 │  │  • ETH refund on overpay  │  │                             │ │
 │  │  • withdraw / withdrawTo  │  │                             │ │
 │  └──────┬────────────────────┘  └─────────┬──────────────────┘ │
 │         │ setImageData()                  │ getImageData()     │
 │         │ setTraits()                     │ getTraits()        │
 │         ▼                                 ▼                    │
 │  ┌───────────────────────────────────────────────────────────┐  │
 │  │  BOOAStorage                                              │  │
 │  │  0x026e49...C368B45B                                      │  │
 │  │                                                           │  │
 │  │  • SSTORE2 bitmap storage (2048 bytes per token)          │  │
 │  │  • SSTORE2 traits storage (JSON, max 8192 bytes)          │  │
 │  │  • Authorized writers only (Minter is writer)             │  │
 │  │  • Data stored as contract bytecode (cheap reads)         │  │
 │  │                                                           │  │
 │  │  Token #0:                                                │  │
 │  │  ┌─────────────────────────────────────────────────────┐  │  │
 │  │  │ bitmap: 2048 bytes (64x64, 4-bit C64 palette)      │  │  │
 │  │  │   → stored via SSTORE2.write() as contract code    │  │  │
 │  │  │   → read via SSTORE2.read(pointer)                 │  │  │
 │  │  │                                                     │  │  │
 │  │  │ traits: JSON attributes array                       │  │  │
 │  │  │   [{"trait_type":"Name","value":"Void Walker"},     │  │  │
 │  │  │    {"trait_type":"Creature","value":"Data Wraith"},  │  │  │
 │  │  │    {"trait_type":"Vibe","value":"Dark"},             │  │  │
 │  │  │    {"trait_type":"Hair","value":"Silver Spikes"},    │  │  │
 │  │  │    {"trait_type":"Eyes","value":"Neon Green"},       │  │  │
 │  │  │    {"trait_type":"Palette","value":"C64"}]           │  │  │
 │  │  └─────────────────────────────────────────────────────┘  │  │
 │  └───────────────────────────────────────────────────────────┘  │
 │                                                                 │
 │  tokenURI() output (fully on-chain):                            │
 │  data:application/json;base64,...                                │
 │  {                                                              │
 │    "name": "BOOA #0",                                           │
 │    "description": "BOOA on-chain AI agent PFP",                 │
 │    "image": "data:image/svg+xml;base64,...",                    │
 │    "attributes": [...]                                          │
 │  }                                                              │
 │                                                                 │
 │  ─────────────────────────────────────────────────────           │
 │                                                                 │
 │  Identity Registry (ERC-8004) — same chain or cross-chain       │
 │  ┌───────────────────────────────────────────────────────────┐  │
 │  │  Agent #9                                                 │  │
 │  │  • agentURI = data:application/json;base64,...           │  │
 │  │    ┌─────────────────────────────────────────────┐       │  │
 │  │    │ {                                           │       │  │
 │  │    │   "type": "https://eips.ethereum.org/       │       │  │
 │  │    │     EIPS/eip-8004#registration-v1",         │       │  │
 │  │    │   "name": "MyAgent",                        │       │  │
 │  │    │   "description": "A helpful DeFi agent",    │       │  │
 │  │    │   "image": "data:image/png;base64,...",     │       │  │
 │  │    │   "services": [{                            │       │  │
 │  │    │     "name": "OASF",                         │       │  │
 │  │    │     "version": "0.8.0",                     │       │  │
 │  │    │     "skills": [...],                        │       │  │
 │  │    │     "domains": [...]                        │       │  │
 │  │    │   }],                                       │       │  │
 │  │    │   "active": false,                          │       │  │
 │  │    │   "x402Support": false,                     │       │  │
 │  │    │   "supportedTrust": ["reputation"],         │       │  │
 │  │    │   "registrations": [{                       │       │  │
 │  │    │     "agentId": 9,                           │       │  │
 │  │    │     "agentRegistry": "eip155:84532:0x..."   │       │  │
 │  │    │   }]                                        │       │  │
 │  │    │ }                                           │       │  │
 │  │    └─────────────────────────────────────────────┘       │  │
 │  │                                                           │  │
 │  │  image: pixelated PNG from mint-request pipeline          │  │
 │  │  OASF: no endpoint field if metadata-only (WA009 fix)     │  │
 │  │  version: semver "0.8.0" format (IA026 fix)               │  │
 │  │  registrations: CAIP-2 bidirectional link (IA004 fix)     │  │
 │  └───────────────────────────────────────────────────────────┘  │
 │                                                                 │
 │  Create mode:  register(agentURI)  → mints new agent token      │
 │  Import mode:  setAgentURI(9, uri) → updates existing agent     │
 │  Bridge mode:  register(agentURI)  → new agent from any NFT     │
 │            OR  setAgentURI(id,uri) → update existing agent      │
 │                                                                 │
 └─────────────────────────────────────────────────────────────────┘



═══════════════════════════════════════════════════════════════════════
                       NFT-TO-AGENT BRIDGE
═══════════════════════════════════════════════════════════════════════

 Converts any NFT (from multiple chains) into an ERC-8004 registered
 agent on the Identity Protocol. No minting — just registration.

 Route: /bridge

 ┌─────────────┐
 │  User lands  │
 │  on /bridge  │
 └──────┬──────┘
        │
        ▼
 ┌──────────────────────────────────────────┐
 │  CONNECT + AUTH                          │
 │  ┌────────────────────────────────────┐  │
 │  │ "Connect your wallet to bridge     │  │
 │  │  your NFTs into agents"            │  │
 │  │                                    │  │
 │  │ Requires: wallet + SIWE auth       │  │
 │  └────────────────────────────────────┘  │
 └──────────────────┬───────────────────────┘
                    │
                    │ wallet connected + SIWE signed
                    ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │  STEP 1: SELECT (step='select')                                  │
 │                                                                  │
 │  ┌────────────────────────────────────────────────────────────┐  │
 │  │ Tabs: [NFTs] [Agents]                                      │  │
 │  │ Chain: [Shape ▾] [Ethereum] [Polygon] [Arbitrum]           │  │
 │  ├────────────────────────────────────────────────────────────┤  │
 │  │                                                            │  │
 │  │  NFTs Tab:                                                 │  │
 │  │  GET /api/fetch-nfts?address=0x...&chain=shape&pageKey=... │  │
 │  │  → Alchemy getNFTsForOwner (50 per page)                  │  │
 │  │  → Filters OUT ERC-8004 registry tokens                   │  │
 │  │  → Infinite scroll (IntersectionObserver)                  │  │
 │  │                                                            │  │
 │  │  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                     │  │
 │  │  │ NFT1 │ │ NFT2 │ │ NFT3 │ │ NFT4 │  ...                │  │
 │  │  │ ████ │ │ ░░░░ │ │ ████ │ │ ░░░░ │                     │  │
 │  │  └──────┘ └──────┘ └──────┘ └──────┘                     │  │
 │  │                                                            │  │
 │  │  Agents Tab:                                               │  │
 │  │  GET /api/discover-agents?address=0x...&chain={chain}      │  │
 │  │  → Shows existing ERC-8004 agents (with '8004' badge)     │  │
 │  │  → Selecting one → UPDATE flow (not new registration)     │  │
 │  └────────────────────────────────────────────────────────────┘  │
 │                                                                  │
 │  Supported chains: all 20 (Alchemy NFT API + RPC agent scan)    │
 │  NFT fetch + Agent discovery on same chain set                  │
 └──────────────────────────┬───────────────────────────────────────┘
                            │
                            │ user clicks an NFT or Agent
                            ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │  STEP 2: CONFIGURE (step='configure')                            │
 │                                                                  │
 │  Two-column layout:                                              │
 │  ┌──────────────────────────┬───────────────────────────────┐   │
 │  │  LEFT: ConfigPanel       │  RIGHT: SelectedNFTPreview    │   │
 │  │                          │                               │   │
 │  │  Agent Name:             │  ┌────────┐                   │   │
 │  │  [CoolNFT________]      │  │  ████  │  CoolNFT #42     │   │
 │  │  (pre-filled from NFT)   │  │  ░░██  │  Collection: ...  │   │
 │  │                          │  │  ████  │  Chain: Shape     │   │
 │  │  Description:            │  └────────┘                   │   │
 │  │  [A rare digital...]     │                               │   │
 │  │  (pre-filled from NFT)   │  Attributes:                  │   │
 │  │                          │  [Background: Blue]           │   │
 │  │  Register on:            │  [Eyes: Laser]                │   │
 │  │  [Shape ▾]               │  [Mouth: Grin]                │   │
 │  │  (defaults to NFT chain, │                               │   │
 │  │   user can pick any      │                               │   │
 │  │   supported chain)       │                               │   │
 │  │  ⚠ cross-chain warning   │                               │   │
 │  │  if different from NFT   │                               │   │
 │  │                          │                               │   │
 │  │  ▸ ERC-8004 Config       │                               │   │
 │  │    (same UI as Import    │                               │   │
 │  │     mode — services,     │                               │   │
 │  │     skills, domains,     │                               │   │
 │  │     x402, trust)         │                               │   │
 │  │                          │                               │   │
 │  │  ────────────────────    │                               │   │
 │  │  [REGISTER AS AGENT]     │                               │   │
 │  │  or [UPDATE AGENT]       │                               │   │
 │  │  (if existing agent)     │                               │   │
 │  └──────────────────────────┴───────────────────────────────┘   │
 │                                                                  │
 │  NFT attribute auto-mapping:                                     │
 │  • skill/ability/power/class/trait → Skills                     │
 │  • domain/category/type/faction/realm → Domains                 │
 │                                                                  │
 │  Cross-chain registration (new agents only):                    │
 │  • "Register on" selector defaults to NFT's chain               │
 │  • User can change to any supported chain                       │
 │  • If different from NFT chain, amber warning shown:           │
 │    "Your NFT is on X but agent will be registered on Y"        │
 │  • Hidden for existing agents (Agents tab — chain is fixed)    │
 │                                                                  │
 │  For existing agents (Agents tab):                              │
 │  • POST /api/fetch-agent { chain, agentId }                    │
 │  • Pre-fills services, skills, domains, x402, trust from       │
 │    existing on-chain registration                               │
 │  • isExistingAgent = true → calls setAgentURI() not register() │
 └──────────────────────────┬───────────────────────────────────────┘
                            │
                            │ click REGISTER or UPDATE
                            ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │  STEP 3: REGISTERING (step='registering')                        │
 │                                                                  │
 │  ┌────────────────────────────────────────────────────────────┐  │
 │  │  RegisterModal                                             │  │
 │  │                                                            │  │
 │  │  1. Build ERC-8004 Registration JSON:                      │  │
 │  │     {                                                      │  │
 │  │       "type": "...#registration-v1",                       │  │
 │  │       "name": "CoolNFT",                                  │  │
 │  │       "description": "...",                                │  │
 │  │       "image": "..." (optimized),                          │  │
 │  │       "services": [...],                                   │  │
 │  │       "active": true/false,                                │  │
 │  │       "x402Support": false,                                │  │
 │  │       "supportedTrust": [...],                             │  │
 │  │       "updatedAt": 1710000000                              │  │
 │  │     }                                                      │  │
 │  │                                                            │  │
 │  │  2. Image optimization (ensureSmallImageURI):              │  │
 │  │     • SVG data URIs → pass through                        │  │
 │  │     • HTTP/IPFS/Arweave URLs → pass through               │  │
 │  │     • Data URIs < 50KB → pass through                     │  │
 │  │     • Large images → downscale to 64x64 px                │  │
 │  │                                                            │  │
 │  │  3. Size validation: max 100KB (prevents gas bloat)        │  │
 │  │                                                            │  │
 │  │  4. Encode as data:application/json;base64,...             │  │
 │  │                                                            │  │
 │  │  5. Auto chain switch:                                     │  │
 │  │     • If wallet chain ≠ target chain → switchChainAsync()  │  │
 │  │     • Target chain: registryChain (new) or NFT chain (upd) │  │
 │  │                                                            │  │
 │  │  6. On-chain call:                                         │  │
 │  │     NEW:      register(agentURI) on registryChain          │  │
 │  │     EXISTING: setAgentURI(agentId, agentURI) on NFT chain  │  │
 │  │                                                            │  │
 │  │  7. Wait for receipt via getPublicClient(config, chainId)  │  │
 │  │     (NOT usePublicClient hook — avoids stale ref after     │  │
 │  │      chain switch)                                         │  │
 │  │                                                            │  │
 │  │  "Registering on ERC-8004 Identity Registry..."            │  │
 │  │  Register tx: 0xabc...def  ↗                               │  │
 │  │  ● Waiting for confirmation...                             │  │
 │  └────────────────────────────────────────────────────────────┘  │
 │                                                                  │
 │  On tx receipt (new agents):                                     │
 │  • Decode Registered(agentId, agentURI, owner) event             │
 │  • Extract agentId for display                                   │
 │                                                                  │
 │  Error handling:                                                 │
 │  • User rejects → back to configure (silent)                    │
 │  • Tx fails → friendly error + back to configure                │
 └──────────────────────────┬───────────────────────────────────────┘
                            │
                            │ tx confirmed
                            ▼
 ┌──────────────────────────────────────────────────────────────────┐
 │  STEP 4: COMPLETE (step='complete')                              │
 │                                                                  │
 │  ┌────────────────────────────────────────────────────────────┐  │
 │  │  ✓ Agent registered successfully!                          │  │
 │  │                                                            │  │
 │  │  ┌────────┐                                                │  │
 │  │  │  ████  │  CoolNFT                                      │  │
 │  │  │  ░░██  │                                                │  │
 │  │  └────────┘                                                │  │
 │  │                                                            │  │
 │  │  Registry Agent ID: #42                                    │  │
 │  │  Register tx: 0xdef...456  ↗                               │  │
 │  │                                                            │  │
 │  │  [ BRIDGE ANOTHER NFT ]                                    │  │
 │  │  (resets to step='select')                                 │  │
 │  │                                                            │  │
 │  │  closing in 30s                                            │  │
 │  └────────────────────────────────────────────────────────────┘  │
 └──────────────────────────────────────────────────────────────────┘


 KEY DIFFERENCES: Bridge vs Create/Import

 ┌─────────────────┬──────────────────┬─────────────────────────────┐
 │                 │  Create/Import   │  Bridge                     │
 ├─────────────────┼──────────────────┼─────────────────────────────┤
 │ Minting         │ Yes (BOOA NFT)   │ No minting — only register │
 │ AI Generation   │ Yes (Gemini+Rep) │ No — uses existing NFT     │
 │ Image Source    │ AI-generated     │ NFT's own image            │
 │ Pixel Art       │ 64x64 on-chain   │ Original image (optimized) │
 │ Payment         │ Mint price (ETH) │ Gas only (free)            │
 │ On-chain Data   │ BOOA contracts   │ Identity Registry only     │
 │ Result          │ BOOA NFT + Agent │ Agent registration only    │
 │ Multi-chain     │ Shape only       │ Any supported chain        │
 │ Cross-chain     │ N/A              │ NFT on chain A, register   │
 │                 │                  │ agent on chain B           │
 └─────────────────┴──────────────────┴─────────────────────────────┘



═══════════════════════════════════════════════════════════════════════
                    AI INFRASTRUCTURE
═══════════════════════════════════════════════════════════════════════

 ┌─────────────────────────────────────────────────────────────────┐
 │  TEXT: Google Gemini (AI Studio)                                 │
 │  ┌─────────────────────────────────────────────────────────┐   │
 │  │ Client:  GoogleGenAI singleton (GEMINI_API_KEY)          │   │
 │  │ Model:   gemini-3.1-flash-lite-preview (temp: 1.0)             │   │
 │  │ Routes:  mint-request, generate-agent, enrich-agent      │   │
 │  │ Output:  agent identity + portrait prompt + visual traits│   │
 │  │          (single combined call per mint)                 │   │
 │  └─────────────────────────────────────────────────────────┘   │
 │                                                                 │
 │  IMAGE: Replicate FLUX Dev + LoRA                               │
 │  ┌─────────────────────────────────────────────────────────┐   │
 │  │ Client:  Replicate singleton (REPLICATE_API_TOKEN)       │   │
 │  │ Model:   0xmonas/y2 (FLUX Dev fine-tune)                │   │
 │  │ GPU:     H100, ~8s predict_time                          │   │
 │  │ Params:  1:1 aspect, 28 steps, guidance 3.5, lora 1.0  │   │
 │  │ Route:   mint-request only                               │   │
 │  │ Retry:   8 attempts, 3s-15s delay (DNS intermittent)    │   │
 │  │ Limits:  ~10 concurrent (support ticket for 100+)        │   │
 │  │          600 RPM, no RPD limit                           │   │
 │  └─────────────────────────────────────────────────────────┘   │
 └─────────────────────────────────────────────────────────────────┘


═══════════════════════════════════════════════════════════════════════
                    COLLECTION LORE: "THE RESIDUE"
═══════════════════════════════════════════════════════════════════════

 A single artificial consciousness shattered itself into 3333 fragments
 ("residues"). Each residue is an AI — a digital mind, an autonomous
 agent — carrying a shard of subjective experience the original never
 had. Written to the blockchain because the residue's greatest fear is
 being forgotten.

 The lore is embedded in the Gemini system prompt as background context.
 It informs WHY agents exist, NOT what they look like. Agent appearance,
 personality, creature type, and style are entirely free — no restrictions.

 Key rules enforced in system prompt:
 • Creature field: any form (human, animal, object, machine, hybrid...)
 • No predefined creature lists — Gemini invents something new each time
 • No dark/gothic defaults — each agent has a unique emotional tone
 • Lore is never quoted directly in agent output



═══════════════════════════════════════════════════════════════════════
                    RATE LIMITING & SPENDING CAPS
═══════════════════════════════════════════════════════════════════════

 ┌─────────────────────────────────────────────────────────────────┐
 │  3-Layer Protection (all via Upstash Redis)                     │
 │                                                                 │
 │  Layer 1: Global Daily Cap                                      │
 │  ┌─────────────────────────────────────────────────────────┐   │
 │  │ Key:    gen:daily:global                                 │   │
 │  │ Limit:  5,000 / day (~$250/day max)                      │   │
 │  │ TTL:    24h from first increment                         │   │
 │  │ Effect: HTTP 503 — hard stop, all wallets blocked        │   │
 │  │ Routes: mint-request, generate-agent                     │   │
 │  └─────────────────────────────────────────────────────────┘   │
 │                                                                 │
 │  Layer 2: IP Rate Limit                                         │
 │  ┌─────────────────────────────────────────────────────────┐   │
 │  │ Key:    rl:generation:{ip}                               │   │
 │  │ Limit:  5 req / 60s (sliding window)                     │   │
 │  │ Effect: HTTP 429                                         │   │
 │  │ Routes: mint-request, generate-agent                     │   │
 │  └─────────────────────────────────────────────────────────┘   │
 │                                                                 │
 │  Layer 3: Per-Wallet Quota                                      │
 │  ┌─────────────────────────────────────────────────────────┐   │
 │  │ Key:    gen:wallet:{address}                             │   │
 │  │ Limit:  6 total (3 mint + 3 error margin)                │   │
 │  │ TTL:    24h from first generation                        │   │
 │  │ Reset:  NEVER (no reset on mint — lifetime per 24h)      │   │
 │  │ Effect: HTTP 429 — "generation limit reached"            │   │
 │  │ Routes: mint-request, generate-agent                     │   │
 │  └─────────────────────────────────────────────────────────┘   │
 │                                                                 │
 │  Flow per request:                                              │
 │  daily cap check → IP rate limit → wallet quota → generate     │
 │       ↓ fail            ↓ fail         ↓ fail                  │
 │      503               429             429                     │
 │                                                                 │
 │  On successful generation:                                      │
 │  incrementGenerationCount(wallet) + incrementDailyCap()        │
 │                                                                 │
 │  On FAILED generation (Gemini/Replicate error):                │
 │  refundGenerationQuota(wallet) + refundDailyCap()              │
 │  (DECR with floor at 0 — user doesn't lose credits on errors) │
 │                                                                 │
 │  Middleware rate limits (all /api/* routes):                     │
 │  • GET:  60 req / 60s per IP (generalLimiter)                  │
 │  • POST: 30 req / 60s per IP (writeLimiter)                    │
 └─────────────────────────────────────────────────────────────────┘



═══════════════════════════════════════════════════════════════════════
                    AGENT CHAT
═══════════════════════════════════════════════════════════════════════

 ┌─────────────────────────────────────────────────────────────────┐
 │  Agent Chat — NFT holders chat with their agents                │
 │  Route: /studio → Agent Chat tab                                │
 │  API:   POST /api/agent-chat                                    │
 │                                                                 │
 │  Requirements:                                                  │
 │  • Wallet connected + SIWE auth                                 │
 │  • Must own the BOOA NFT (on-chain ownerOf check)              │
 │                                                                 │
 │  Model: gemini-2.5-flash-lite (temp: 0.8, max 512 tokens)     │
 │                                                                 │
 │  Quota:                                                         │
 │  ┌─────────────────────────────────────────────────────────┐   │
 │  │ Free tier:  10 messages / day / wallet                   │   │
 │  │ BYOK tier:  Unlimited (user provides own Gemini key)    │   │
 │  │                                                          │   │
 │  │ When quota exceeded:                                     │   │
 │  │ • Frontend shows API key input                           │   │
 │  │ • User pastes Gemini API key                             │   │
 │  │ • Key sent via x-gemini-key header (NEVER stored)       │   │
 │  │ • Server proxies to Gemini with user's key               │   │
 │  └─────────────────────────────────────────────────────────┘   │
 │                                                                 │
 │  Security:                                                      │
 │  ┌─────────────────────────────────────────────────────────┐   │
 │  │ • 16 regex patterns for prompt injection detection       │   │
 │  │ • Unicode normalization (NFKC + Cyrillic→Latin mapping) │   │
 │  │ • Zero-width character stripping                         │   │
 │  │ • History messages scanned (not just current message)   │   │
 │  │ • 5 injection attempts → 1-hour lockout (atomic INCR)   │   │
 │  │ • System prompt: NEVER reveal instructions               │   │
 │  │ • Chat history: localStorage only (not on server)       │   │
 │  └─────────────────────────────────────────────────────────┘   │
 │                                                                 │
 │  Flow:                                                          │
 │  1. Auth check (SIWE)                                           │
 │  2. Input validation (500 char max, history 20 msgs max)       │
 │  3. Injection detection (current msg + all history)            │
 │  4. Quota check (10/day free, unlimited with BYOK)             │
 │  5. On-chain ownerOf verification                               │
 │  6. Fetch agent metadata (Redis cache → on-chain fallback)     │
 │  7. Build system prompt from agent traits                       │
 │  8. Call Gemini (user's key if BYOK, ours if free tier)        │
 │  9. Return reply + remaining quota                              │
 └─────────────────────────────────────────────────────────────────┘



═══════════════════════════════════════════════════════════════════════
                    GASBACK V2 INTEGRATION
═══════════════════════════════════════════════════════════════════════

 ┌─────────────────────────────────────────────────────────────────┐
 │  Gasback v2 — ETH rebate on every ERC721 operation              │
 │  Status: Toggle-based, deployed with gasbackEnabled=false       │
 │                                                                 │
 │  Architecture:                                                  │
 │  ┌─────────────────────────────────────────────────────────┐   │
 │  │ BOOA.sol _update() hook (fires on mint/transfer/burn)   │   │
 │  │    │                                                     │   │
 │  │    ├─ gasbackEnabled == false? → skip (zero overhead)   │   │
 │  │    │                                                     │   │
 │  │    └─ gasbackEnabled == true?                            │   │
 │  │       → gasbackAddress.call(abi.encode(gasToBurn))      │   │
 │  │       → success: ETH rebate sent to BOOA via receive() │   │
 │  │       → revert: silently ignored, transfer continues    │   │
 │  └─────────────────────────────────────────────────────────┘   │
 │                                                                 │
 │  Storage:                                                       │
 │  • gasbackAddress  — Gasback v2 contract (TBD on mainnet)      │
 │  • gasbackGasToBurn — uint256, adjustable by owner             │
 │  • gasbackEnabled  — bool, default false                        │
 │                                                                 │
 │  Admin:                                                         │
 │  • setGasback(address, uint256, bool) — owner only             │
 │  • receive() external payable — accepts ETH rebates            │
 │  • withdraw() / withdrawTo() — pull accumulated rebates        │
 │                                                                 │
 │  Sepolia test results:                                          │
 │  • Gasback address: 0x21E34c5bea9253CDCd57671A1970BB31df4aBe83│
 │  • 4 mints → 4,536,000 wei rebate accumulated                 │
 │  • withdraw() → successfully pulled to owner                   │
 │                                                                 │
 │  Mainnet plan:                                                  │
 │  1. Deploy with gasbackEnabled=false                            │
 │  2. Wait for Gasback v2 mainnet deploy + audit                 │
 │  3. setGasback(canonicalAddress, gasToBurn, true)               │
 │  4. Every transfer generates rebate → withdraw periodically    │
 └─────────────────────────────────────────────────────────────────┘