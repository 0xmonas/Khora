// Plain-text mirror of /privacy and /terms pages — used by BOOASK searchBooaDocs index.
// When updating /privacy or /terms page.tsx, also update the text below.

export const PRIVACY_TEXT = `Privacy Policy — BOOA

Last updated: March 21, 2026

Introduction
BOOA ("we," "our," or "the Project") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and protect your information when you use our AI agent identity platform and Web3 services.

Information We Collect

Blockchain Data: When you connect your wallet, we access your public wallet address. This information is publicly available on the blockchain and is necessary to provide our services (minting, ownership verification, agent chat).

SIWE Authentication: We use Sign-In with Ethereum (SIWE) for authentication. Your session is stored in an encrypted iron-session cookie. No passwords or private keys are ever collected.

Rate Limiting Data: We store per-wallet usage counters (daily generation quota, chat quota, injection attempt counts) in Upstash Redis with automatic TTL expiration (24 hours for quotas, 1 hour for security locks). IP addresses are used for rate limiting only and are not permanently stored.

Agent Metadata: Generated agent data (name, traits, personality) is cached in Redis for performance. This data is also stored immutably on-chain — the Redis cache is a performance optimization only.

Analytics: We use Vercel Analytics for anonymized usage data including page views and general navigation patterns. No personally identifiable information is collected through analytics.

What We Do NOT Collect
- Private keys or seed phrases — never, under any circumstance
- Chat history — stored only in your browser (localStorage), never on our servers
- User-provided Gemini API keys — sent via HTTPS header per-request only, never stored, logged, or cached
- Email addresses, phone numbers, or real names
- Location data beyond what IP-based rate limiting infers

How We Use Your Information
- To verify NFT ownership for agent chat and holder features
- To enforce rate limits and prevent abuse (generation quotas, chat quotas)
- To detect and block prompt injection attacks
- To cache agent metadata for faster page loads
- To process waitlist registrations (wallet address + Twitter handle)
- To verify Merkle proofs for allowlist minting

Third-Party Services
Google Gemini AI: Used for agent text generation and chat. Your chat messages are sent to Google's API for processing.
Replicate: Used for AI pixel art generation (FLUX model). Agent trait data is sent to Replicate for image generation.
Upstash Redis: Used for rate limiting, quota tracking, and metadata caching. Data is stored with automatic TTL expiration.
Cloudflare Turnstile: Used for bot protection on waitlist registration.
Alchemy: Used for blockchain RPC calls and NFT data fetching.
Wallet Providers: MetaMask, Rainbow, WalletConnect, and other wallet providers have their own privacy policies. We do not control or have access to your private keys.
Blockchain Networks: Transactions on Shape Network, Ethereum, Base, and other supported EVM chains are permanent and publicly visible. We do not control blockchain data.

Cookies & Storage
Essential Cookies: iron-session cookie for SIWE authentication. Required for wallet sign-in. Cannot be disabled.
Local Storage: Chat history, wallet connection state, and user preferences are stored locally in your browser. We do not have access to this data. You can clear it at any time.

Third-Party Links
This website contains links to third-party services (8004scan.io, OpenSea, OnchainChecker, wallet providers, etc.). These services have their own privacy policies. We do not control how they collect or use your data. Clicking external links is at your own risk.

ERC-8004 Registry Data
Agent registrations on the ERC-8004 Identity Registry are processed through third-party smart contracts we do not own or control. Data written to the registry (agent metadata, identity records) is permanent and publicly visible on the blockchain.

Data Retention
- Rate limit counters: 24 hours (auto-expire)
- Security locks: 1 hour (auto-expire)
- Metadata cache: Variable TTL, refreshed from on-chain data
- Local storage: Until you clear it manually
- Blockchain data: Permanent and immutable

Your Privacy Rights
Depending on your location, you may have the right to access your personal data, request data deletion (where technically feasible), opt-out of analytics, or data portability.
Note: Blockchain data cannot be deleted or modified once recorded, as it is a permanent, decentralized public ledger.

Children's Privacy
Our platform is not intended for users under 18 years of age. We do not knowingly collect personal information from children.

Changes to Privacy Policy
We may update this Privacy Policy from time to time. Changes will be posted on this page with an updated date.

Contact
For privacy questions, reach out through X (@booanft).`;

export const TERMS_TEXT = `Terms of Service — BOOA

Last updated: March 21, 2026

Acceptance of Terms
By accessing and using BOOA's platform (booa.app), you agree to be bound by these Terms of Service. If you do not agree, do not use the service.

About the Service
BOOA is an open-source AI agent identity platform that enables users to mint NFTs representing AI agents on the Shape Network and register them on the ERC-8004 Identity Registry across multiple EVM chains. The platform provides studio tools, wallet connection (SIWE), agent chat, bridge functionality, and related Web3 services.

Eligibility
You must be at least 18 years old to use this platform. You must have the legal capacity to enter into binding agreements. You must not be located in a jurisdiction where cryptocurrency or NFT activities are prohibited.

Wallet & Cryptocurrency
You are solely responsible for the security of your wallet, private keys, and seed phrases. We never request, store, or have access to your private keys. Cryptocurrency transactions are irreversible — verify all details before confirming. We are not responsible for losses due to user error, wallet compromise, phishing attacks, or third-party wallet provider issues.

NFT Ownership & Rights
When you mint a BOOA NFT, you own the NFT (the token on-chain) and the immutable on-chain data (pixel art bitmap, traits, agent metadata). You grant the BOOA team and other holders the right to display NFT content for promotional and platform purposes. NFTs are stored on-chain (Shape Network). The art and metadata cannot be deleted, modified, or censored once minted.

Intellectual Property
The BOOA platform code is licensed under MIT. You can fork, modify, and use it under those terms. The BOOA brand, logo, and marketing materials remain the intellectual property of the BOOA team. Generated agent content (names, descriptions, personalities, pixel art) belongs to the NFT holder.

User Conduct
You agree NOT to: attempt to bypass rate limits, security measures, or anti-abuse systems; engage in prompt injection or attempts to manipulate AI models; create agents with content that is illegal, harmful, harassing, defamatory, or violates third-party rights; use the platform for money laundering, fraud, or other illegal activities; reverse-engineer or attempt unauthorized access to private APIs; spam, scrape, or extract data beyond fair use; impersonate other users, agents, or the BOOA team.

AI-Generated Content
Agent personalities, names, descriptions, and traits are generated by AI (Gemini, Replicate FLUX). Output may occasionally be inaccurate, offensive, or inappropriate. You are responsible for reviewing generated content before minting and accept responsibility for content stored on-chain through your transactions.

Smart Contracts & Blockchain Risks
Smart contracts are immutable once deployed. Bugs or vulnerabilities may exist. We do not guarantee the security of smart contracts. Blockchain transactions are public and permanent. Gas fees, network congestion, and chain availability are outside our control.

Service Availability
The platform is provided "AS IS" without warranties. We do not guarantee 100% uptime. Scheduled maintenance, technical issues, or third-party service outages may temporarily affect availability. We reserve the right to modify, suspend, or discontinue any feature at any time.

Limitation of Liability
To the maximum extent permitted by law, BOOA, its team, and contributors shall not be liable for: any indirect, incidental, special, consequential, or punitive damages; loss of profits, revenue, data, or use; cryptocurrency losses, NFT value fluctuations, or transaction failures; third-party service issues (wallet providers, RPC providers, AI model providers); any damages exceeding the amount you paid us in the past 12 months (typically zero, as our services are free).

Indemnification
You agree to indemnify and hold harmless BOOA, its team, and contributors from any claims, damages, losses, or expenses arising from your use of the platform, your violation of these terms, your violation of third-party rights, or content you create or store on-chain through our platform.

Governing Law
These terms are governed by the laws of Turkey. Any disputes shall be resolved in the courts of Istanbul, Turkey, unless otherwise required by mandatory law.

Modifications to Terms
We may update these Terms of Service at any time. Changes will be posted on this page with an updated date.

Termination
We may suspend or terminate your access to the platform at any time, for any reason, without notice, including for violation of these terms. You may stop using the platform at any time.

Severability
If any provision of these terms is found to be unenforceable, the remaining provisions shall continue in full force and effect.

Contact
For questions about these terms, please reach out through our official channels on X (@booanft).`;
