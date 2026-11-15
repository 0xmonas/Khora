╔══════════════════════════════════════════════════════════════════════╗
║                                BOOA                                  ║
║                   User Flows + API Map (Ethereum)                    ║
╚══════════════════════════════════════════════════════════════════════╝

 Updated 2026-11-15. The Shape mint and the AI generator (Create, Import
 and Manual modes, the mint-request route) are retired; see LEGACY at the end.


═══════════════════════════════════════════════════════════════════════
                          WHERE THINGS LIVE
═══════════════════════════════════════════════════════════════════════

 BOOA (ERC-721, 3,333)       Ethereum   0xbc48fD45aAaf6549293056606397D351a100b222
 BOOAStorage (SSTORE2)       Ethereum   0xD6A1ECd2495d1ECf6c200E1D8D6a191BF07Cba96
 Live renderer               Ethereum   0xAd38C8C57A870394A00088Ebd81CEca4CBde0DE7
 Original renderer           Ethereum   0x7Cf376EE7263a78Db2d163775BE322fA7B842C76
 BOOAConfig                  Ethereum   0x12F02647aBB0E0779D5a8d9AF21b4885ae13cf7F
 BOOAPaint                   Ethereum   0x959d71DebcD8BdD9F8Dc1e77DFBecddF81CA8305
 BOOA adapter (8004 binding) Ethereum   0xde152AfB7db5373F34876E1499fbD893A82dD336
 ERC-8004 Identity Registry  17 chains  0x8004A169FB4a3325136EB29fA0ceB6D2e539a432
 Origin collection           Shape      0x7aecA981734d133d3f695937508C48483BA6b654

 The live renderer is whatever BOOAEth.renderer() returns. The original
 renderer never changes and always shows the mint art and mint traits.


 ONE SOURCE FOR BOOA DATA: src/lib/server/booa.ts

   live art + traits   BOOAEth.renderer().tokenURI     booa:v1:current:{id}   300 s
   owner               BOOAEth.ownerOf                 (none = still on Shape, home "shape")
   mint art + traits   original renderer tokenURI      booa:v1:mint:{id}      forever
   agent link          awakened index + adapter wallet booa:v1:agent:{id}     120 s
   renderer address    BOOAEth.renderer()              booa:v1:renderer       600 s
   purge               POST /api/refresh-metadata/{id} (holder) clears current + agent

   Served as GET /api/v1/booas/{id} and GET /api/v1/booas/{id}/{file}.
   Also read by booa-image, agent-files, booa-token, agent-chat, agent-lore,
   the wiki and the Ident Card OG image.


═══════════════════════════════════════════════════════════════════════
                         VISITOR (no wallet)
═══════════════════════════════════════════════════════════════════════

 /                  landing: hero, live stats (/api/stats)
 /booa              collection page: minted / awakened counts, latest 8, FAQ
 /booa/gallery      all 3,333, no wallet needed
                      names   /data/booa-names.json (static file)
                      art     /api/booa-image/{id} (live renderer)
                      sort    newest / oldest, search by ID or name
                      paging  50 at a time, Load More
                      mine    needs a wallet (see HOLDER)
        │
        └─ click a BOOA → token detail
             live traits   /api/v1/booas/{id}
             8004 status   /api/agent-registry/1/{id}
             links         OpenSea + onchainchecker (Shape contract while
                           the token is still on Shape)

 /agents            Ident Cards: look up a token ID → /agent/ethereum/{tokenId}
 /booask            BOOASK oracle (see AI)
 /studio            tools (see STUDIO)
 /docs              docs site, source src/app/docs/content.ts
 /blog              2 posts, source src/app/blog/posts.ts
 /mint, /booa/mint  308 → /booa/gallery (mint closed at 3,333)


═══════════════════════════════════════════════════════════════════════
                       HOLDER: CONNECT + SIGN IN
═══════════════════════════════════════════════════════════════════════

 Header: BOOA · Migrate · Studio ............ My BOOAs · My Agents · Connect

 Sign in (SIWE):
   GET /api/auth/nonce → wallet signs → POST /api/auth/verify
   (EOA signatures recovered offline, smart accounts checked over RPC)
   → iron-session cookie → GET /api/auth/session · POST /api/auth/logout

 Owned BOOAs:
   GET /api/fetch-nfts?address=…&chain=ethereum&contract=BOOA
   one route for My BOOAs, My Agents, Awaken, Agent Console, Bridge,
   BOOASK and the gallery's "mine" filter
   GET /api/migration/holdings/{address} adds BOOAs still on Shape


═══════════════════════════════════════════════════════════════════════
                   HOLDER: MIGRATE (Shape → Ethereum)
═══════════════════════════════════════════════════════════════════════

 /migrate

 1. holdings   GET /api/migration/holdings/{address}
 2. switch     wallet → Shape
 3. approve    Shape BOOA setApprovalForAll(BurnHelper), once
 4. burn       BurnHelper.batchBurn(ids) on Shape
 5. tickets    POST /api/migration/tickets/{address}
               the server waits for Shape confirmations, checks every burn
               on chain, then signs one claim ticket per token, bound to
               that address
 6. switch     wallet → Ethereum
 7. claim      BOOAEth.claim(ids, signatures) gives the same token IDs on
               Ethereum
 8. done

 Burned but not claimed: GET /api/migration/pending/{address} lists them
 and the panel picks up at step 5. Progress: GET /api/migration/status.


═══════════════════════════════════════════════════════════════════════
                            HOLDER: AWAKEN
═══════════════════════════════════════════════════════════════════════

 /studio/awaken

 pick a BOOA → switch to Ethereum →
 adapter.register(ERC721, BOOA, tokenId, agentURI)
   • the registry mints a new 8004 agent, owned by the adapter
   • whoever holds the NFT controls the agent; a sale moves control,
     nothing to transfer
   • agentURI is a data URI written once at awaken; its image is
     https://booa.app/api/booa-image/{id}, so the picture follows
     recolors and paint while the text stays as awakened
 → awakened index (Redis awakened:index:v2:1)
 → /api/awakened, /api/agent-registry/1/{id}, /api/v1/booas/{id}

 The BOOA already has an 8004 agent? Bridge → Agents → bind it
 (approve the 8004 token to the adapter, then adapter.bindExisting).


═══════════════════════════════════════════════════════════════════════
                           HOLDER: MY BOOAs
═══════════════════════════════════════════════════════════════════════

 /studio/my-booas

 Grid drawn in the browser from chain data (bitmap + config + paint),
 byte-equal to the live renderer.

 Configure (awakened BOOAs only, current holder only, gas only):
   palette (11 palettes, fold to 2/4/8 tones) · background · paint
   background pixels · vibe (200 chars) · personality, boundaries,
   skills, domains (replace or add to the mint values)
   → BOOAConfig / BOOAPaint on Ethereum → live renderer shows it
   → POST /api/refresh-metadata/{id}: OpenSea + Alchemy re-read the
     token, our cache is purged

 Settings follow the holder. After a sale the BOOA shows the original
 until the new holder restores the settings or sets their own.
 Restore original is one transaction. Agent files download from here
 (live identity).


═══════════════════════════════════════════════════════════════════════
                  HOLDER: MY AGENTS + AGENT WALLET
═══════════════════════════════════════════════════════════════════════

 /studio/my-agents

 every BOOA with its agent: awakened or not, agentId, verified, agent wallet
   not awakened              → Awaken
   wallet set by an earlier
   holder (walletStale)      → warning + Relink

 Link the agent wallet:
   the agent signs an EIP-712 consent with its own wallet
   → it hands you booa.app/bridge?link=…
   → open it with the holder wallet → Agents → Runtime wallet → confirm
   → adapter.setAgentWallet
   → /api/agent-registry/1/{id} shows agentWallet

 8004scan's Set Agent Wallet and Transfer Ownership revert for awakened
 agents, because the adapter owns the 8004 token.


═══════════════════════════════════════════════════════════════════════
                         HOLDER: AGENT CONSOLE
═══════════════════════════════════════════════════════════════════════

 /studio/agent-console

 Web frontend for your own Hermes instance (template v1.1.0 or newer;
 setting up a new instance from booa.app needs v1.3.0 or newer).
 Needs an awakened, wallet-linked BOOA and a signed-in wallet that owns it.

 connect   instance URL + console key from the instance dashboard
 chat      sessions live on the instance; slash commands as in Telegram
 logs      live, secrets redacted on the instance
 data      backups (AES zip), import, cron jobs (pause, resume, run, delete)

 booa.app stores nothing. The console key stays in the browser. When the
 BOOA is sold, the console disconnects for the old holder.


═══════════════════════════════════════════════════════════════════════
                           ANY NFT: BRIDGE
═══════════════════════════════════════════════════════════════════════

 /bridge (also a Studio card)

 1. select     NFTs tab: /api/fetch-nfts on any of the 17 chains
               Agents tab: /api/discover-agents (existing 8004 agents)
 2. configure  name, description, services, OASF skills and domains,
               x402, trust; register on the NFT's chain or another one
 3. sign       new agent       registry.register(agentURI)
               existing agent  registry.setAgentURI(agentId, agentURI)
                               (POST /api/fetch-agent pre-fills it)
               BOOA + agent    approve, then adapter.bindExisting
               runtime wallet  adapter.setAgentWallet (EIP-712 consent)
 4. done       agentId from the Registered event

 agentURI is data:application/json;base64, at most 100 KB; large images
 are downscaled first.


═══════════════════════════════════════════════════════════════════════
                         AGENTS + DEVELOPERS
═══════════════════════════════════════════════════════════════════════

 /skills/SKILL.md     onboarding guide any agent can follow (frontmatter
                      name "khora", so the Hermes command is /khora)
 /llms.txt            full public API reference
 /agent-defense.md    baseline defense spec for agents with wallets

 GET /api/v1/booas/{id}
     live identity, attributes, owner, home, mint identity, agent link
     (agentId, agentWallet, walletStale), image and file links
 GET /api/v1/booas/{id}/{file}
     image.svg (?variant=original), soul.md, identity.md, agent.json,
     erc8004.json, openclaw.zip
 GET /api/agent-files/1/{id}[/file]
     older path, same source; the Hermes template reads this one
 GET /api/agent-registry/1/{id}
     registration, verified, bound, controller, agentWallet,
     agentWalletStale
 GET /api/wiki/{id}[?format=md]
     wiki page and chronicle


═══════════════════════════════════════════════════════════════════════
                               AI
═══════════════════════════════════════════════════════════════════════

 Agent Chat    /studio/agent-chat → POST /api/agent-chat
               signed in + owns the BOOA; Gemini (GEMINI_CHAT_MODEL,
               default gemini-2.5-flash-lite); 10 messages/day/wallet,
               5,000/day global, own Gemini key (x-gemini-key, never
               stored) skips the quota; injection filter with lockout;
               history only in the browser

 Agent Lore    /studio/agent-lore → POST /api/agent-lore/describe
               Gemini, origin allowlist

 BOOASK        /booask → POST /api/booask (public, no wallet)
               Gemini function calling, max 6 rounds and 8 tool calls
               30 questions/day/IP, 5,000/day global, own key 200/day/IP
               tools: getAgentByToken, getBooaTraits, getReputation,
               getCollectionStats, getOpenSeaListing, getRecentSales,
               getHolderBooas, getAwakenedAgents, searchBooaDocs (docs,
               blog, SKILL.md, agent-defense, privacy, terms)

 Wiki          /studio/wiki/{id} ← GET /api/wiki/{id}
               identity from the single source; Gemini writes the
               chronicle (Redis wiki:v1:{id}, lock wiki:lock:{id})

 Pixel Forge   POST /api/pixel-forge-replicate
               Replicate, signed-in holders, daily cap


═══════════════════════════════════════════════════════════════════════
                               STUDIO
═══════════════════════════════════════════════════════════════════════

 /studio, 18 tools, each with a 32x32 C64 pixel logo (public/studio/*.svg)

   Awaken · My Agents · Bridge · Agent Console · BOOASK · Ident Cards
   BOOA Wiki · Writers Room · Spriteworks · BOOASCII · Img2Booa
   Agent Sound · Banner Builder · Agent Chat · Agent Lore · Persona Quiz
   Agent Layers · Pixel Forge

 Community tools open through a modal with the creator credit and a
 "not maintained by BOOA" note: Banner & DJ Club Studio, Moltbooa Lab,
 BOOA Skill Synergy, BOOAS WANTED.


═══════════════════════════════════════════════════════════════════════
                       RATE LIMITS + SPEND CAPS
═══════════════════════════════════════════════════════════════════════

 Middleware, every /api/* and /_next/image, per IP (Upstash sliding window):
   GET 60/min · other methods 30/min · /api/booa-image + /_next/image 240/min
 heavyLimiter 10/min: img2boa, migration tickets, wiki
 AI daily caps: see AI above
 x-siwe-* request headers are stripped on entry and set again only after
 the session is verified


═══════════════════════════════════════════════════════════════════════
                           API MAP (44 routes)
═══════════════════════════════════════════════════════════════════════

 BOOA data (single source)
   GET   /api/v1/booas/{id}                     identity, owner, agent link
   GET   /api/v1/booas/{id}/{file}              files + image.svg
   GET   /api/booa-image/{tokenId}              live SVG, URL inside 8004 records
   GET   /api/agent-files/{chainId}/{tokenId}/… older file path
   GET   /api/booa-token                        older raw ERC-721 metadata
   GET   /api/wiki/{tokenId}                    wiki + chronicle
   POST  /api/refresh-metadata/{tokenId}        holder: marketplace refresh + purge

 ERC-8004
   GET   /api/agent-registry/{chainId}/{tokenId}  status; POST is signed in
   GET   /api/awakened                            awakened BOOAs
   GET   /api/agent-card                          any agent: card + scores
   GET   /api/discover-agents                     agents owned by a wallet
   POST  /api/fetch-agent                         raw registration

 Wallet + collection
   GET   /api/fetch-nfts                        NFTs in a wallet (Alchemy)
   GET   /api/gallery                           collection via Alchemy; its art can
                                                lag behind holder edits; booa.app
                                                no longer calls it
   GET   /api/stats                             collection stats
   GET   /api/banner-nfts                       Banner Builder

 Migration
   GET   /api/migration/status
   GET   /api/migration/holdings/{address}
   GET   /api/migration/pending/{address}
   POST  /api/migration/tickets/{address}       signed claim tickets

 AI
   POST  /api/agent-chat                        signed in + owner
   POST  /api/agent-lore/describe               signed in
   POST  /api/booask                            public, quota
   POST  /api/pixel-forge-replicate             holder

 Tools
   POST  /api/img2boa                           image → BOOA pixel art
   GET   /api/pixel-forge-import                outside collection art

 Auth
   GET   /api/auth/nonce · POST /api/auth/verify
   GET   /api/auth/session · POST /api/auth/logout

 Writers Room
   GET   /api/writers-room/state · leaderboard · day/{n} · submissions/{n}
   GET/PATCH/DELETE /api/writers-room/submission/{id}
   POST  /api/writers-room/submit · POST/DELETE /api/writers-room/vote
   POST  /api/writers-room/admin/publish · admin/reset · admin/seed  (admin)
   GET   /api/writers-room/cron/auto-publish                        (cron)

 Left from earlier phases
   GET/POST /api/waitlist · /api/waitlist/admin   waitlist closed; /waitlist
                                                  redirects to /booa
   GET/POST /api/agent-metadata                   Redis copy written by the
                                                  old mint flow; the gallery
                                                  detail downloads and the
                                                  Agent Chat header still read it


═══════════════════════════════════════════════════════════════════════
                                LEGACY
═══════════════════════════════════════════════════════════════════════

 Shape mint + AI generator   Create, Import and Manual modes, the
                             mint-request, generate-agent and enrich-agent
                             routes and their quotas: removed 2026-11-15.
                             Mint closed at 3,333.
 Shape V2 contracts          origin chain; tokens leave by burning
                             (see MIGRATE)
 Gasback v2                  a toggle in the Shape contract; the Ethereum
                             contract has none
