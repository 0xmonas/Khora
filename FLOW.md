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
 │  │   0 minted / 0.00015 ETH          │  │
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
        │  │ 1. Rate limit check (IP + wallet quota)             │  │
        │  │                                                     │  │
        │  │ 2. Gemini → generate agent identity                 │  │
        │  │    model: gemini-3-flash-preview (temp: 1.0)        │  │
        │  │    output: name, description, creature, vibe,       │  │
        │  │            emoji, personality[], boundaries[],      │  │
        │  │            skills[], domains[]                      │  │
        │  │                                                     │  │
        │  │ 3. Gemini → generate portrait prompt + visual traits│  │
        │  │    model: gemini-3-flash-preview (temp: 0.7)        │  │
        │  │    output: portrait prompt, visual traits JSON      │  │
        │  │    (Hair, Eyes, Facial Hair, Mouth, Accessory,      │  │
        │  │     Headwear, Skin)                                 │  │
        │  │                                                     │  │
        │  │ 4. Gemini → generate image                          │  │
        │  │    model: gemini-2.5-flash-image                    │  │
        │  │    params: 1:1 aspect                               │  │
        │  │    output: base64 image                             │  │
        │  │                                                     │  │
        │  │ 5. Server-side pixelation + bitmap encoding         │  │
        │  │    • Downscale to 64x64                             │  │
        │  │    • C64 palette quantization (16 colors)           │  │
        │  │    • Encode as 2048-byte bitmap                     │  │
        │  │    (4 bits per pixel, 2 pixels per byte)            │  │
        │  │                                                     │  │
        │  │ 6. Build traits JSON (attributes array)             │  │
        │  │    • Agent traits (name, creature, vibe, etc.)      │  │
        │  │    • Visual traits (hair, eyes, skin, etc.)         │  │
        │  │    • Palette: C64                                   │  │
        │  │                                                     │  │
        │  │ 7. EIP-191 sign(imageData, traitsData,              │  │
        │  │              minter, deadline)                      │  │
        │  │    signer: server-side SIGNER_PRIVATE_KEY           │  │
        │  │    deadline: 5 minutes from now                     │  │
        │  │                                                     │  │
        │  │ 8. Increment wallet generation quota                │  │
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
        │    signature     // server EIP-191 signature              │
        │  )                                                        │
        │                                                           │
        │  ┌─────────────────────────────────────────────────────┐  │
        │  │ On-chain (BOOAMinter.sol):                          │  │
        │  │  1. Check: !paused                                  │  │
        │  │  2. Check: block.timestamp <= deadline              │  │
        │  │  3. Check: msg.value >= mintPrice                   │  │
        │  │  4. Check: mintCount[sender] < maxPerWallet         │  │
        │  │  5. Check: totalSupply < maxSupply                  │  │
        │  │  6. Verify EIP-191 signature from trusted signer    │  │
        │  │  7. Check: signature not already used (replay)      │  │
        │  │  8. booa.mint(sender) → ERC721 token                │  │
        │  │  9. store.setImageData(tokenId, bitmap) → SSTORE2   │  │
        │  │ 10. store.setTraits(tokenId, traitsJSON) → SSTORE2  │  │
        │  │ 11. emit AgentMinted(tokenId, sender)               │  │
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
        │  (resets generation quota for this wallet)        │
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
 │  GET /api/discover-agents?address=0x...                          │
 │                                                                  │
 │  ┌────────────────────────────────────────────────────────────┐  │
 │  │  For each chain (10 chains in parallel):                   │  │
 │  │                                                            │  │
 │  │  Ethereum ──┐                                              │  │
 │  │  Base ──────┤                                              │  │
 │  │  Base Sep ──┤  1. balanceOf(address) → skip if 0           │  │
 │  │  Polygon ───┤  2. findMaxTokenId() → multicall probe       │  │
 │  │  Arbitrum ──┤  3. scanOwnedTokenIds() → parallel waves     │  │
 │  │  Celo ──────┤  4. tokenURI() batch → extract names         │  │
 │  │  Gnosis ────┤     (data URI → base64 decode                │  │
 │  │  Scroll ────┤      OR http URI → fetch JSON)               │  │
 │  │  Taiko ─────┤                                              │  │
 │  │  BNB ───────┘                                              │  │
 │  │                                                            │  │
 │  │  Uses chain-specific registry address:                     │  │
 │  │  • Mainnet: 0x8004A169...9a432                             │  │
 │  │  • Testnet: 0x8004A818...4BD9e  (base-sepolia)            │  │
 │  └────────────────────────────────────────────────────────────┘  │
 │                                                                  │
 │  "Scanning 10 chains..."  (animated)                             │
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
 │  [ REGISTER ON AGENT PROTOCOL ]         ◄── only for owned!    │
 │  "gas only, no fee"                                             │
 │                                                                 │
 └──────────────────────┬──────────────────────────────────────────┘
                        │
                        │ click REGISTER
                        ▼
 ┌─────────────────────────────────────────────────────────────────┐
 │  REGISTERING...                                                 │
 │                                                                 │
 │  Data sources:                                                  │
 │  • Upstash metadata (if available) → full KhoraAgent            │
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
 │    { address, registryAgentId }                                 │
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
 │  │  Base Sepolia: 0x8527988D...Bcb8CBD                       │  │
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
 │  │  0x5881479...Aacd3857     │  │  0xCE684098...aE3692        │ │
 │  │                           │  │                             │ │
 │  │  • Server-signed mint     │  │  • renderSVG(bitmap)        │ │
 │  │  • EIP-191 verification   │  │  • tokenURI() → JSON       │ │
 │  │  • Replay protection      │  │  • C64 16-color palette    │ │
 │  │  • mintPrice / maxSupply  │  │  • RLE path compression    │ │
 │  │  • maxPerWallet / pause   │  │  • DynamicBufferLib        │ │
 │  │  • withdraw / withdrawTo  │  │                             │ │
 │  └──────┬────────────────────┘  └─────────┬──────────────────┘ │
 │         │ setImageData()                  │ getImageData()     │
 │         │ setTraits()                     │ getTraits()        │
 │         ▼                                 ▼                    │
 │  ┌───────────────────────────────────────────────────────────┐  │
 │  │  BOOAStorage                                              │  │
 │  │  0x185c903...aE3692                                       │  │
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
 │                                                                 │
 └─────────────────────────────────────────────────────────────────┘