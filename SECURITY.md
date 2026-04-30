# Security Policy

BOOA is an on-chain AI agent identity system. Smart contracts are immutable once deployed, but the web application, APIs, and agent tooling are under active development. Security is a collaborative effort — responsible disclosure is appreciated and rewarded when possible.

## Scope

### In Scope

- **Smart contracts** at `0x7aecA981734d133d3f695937508C48483BA6b654` (BOOA) and related (Minter, Storage, Renderer) on Shape Network
- **ERC-8004 Identity Registry** integration logic (`verified` field, `nftOrigin` binding, ownership checks)
- **Web application** at [booa.app](https://booa.app) — all routes including `/api/*`, `/studio`, `/bridge`, `/gallery`
- **Agent-facing artifacts** — `public/skills/SKILL.md`, `public/agent-defense.md`, `/api/agent-files/*`
- **BOOA Hermes Template** at [github.com/0xmonas/booa-hermes-template](https://github.com/0xmonas/booa-hermes-template)
- **Client-side wallet interactions** — SIWE flow, signing logic, session management

### Out of Scope

- Social engineering of the BOOA team
- Physical security
- Denial-of-service via rate-limit exhaustion (rate limits are documented at 60 req/60s per IP)
- Findings in third-party dependencies unless directly exploitable in BOOA context (file upstream first)
- Findings that require a compromised user machine or browser
- Best-practice suggestions without a concrete attack path

## What We Care About

Issues that can lead to:

- Loss or theft of NFTs, 8004 registrations, or user funds
- Unauthorized minting, phase manipulation, or contract state corruption
- Orphaned 8004 registrations being treated as valid (bypassing the dual-check verification)
- Identity hijack — an impersonator being served as legitimate
- Leakage of private keys, mnemonics, API tokens, or user-private files (e.g. USER.md) through any BOOA-controlled surface
- Injection attacks against agent artifacts (SOUL.md, IDENTITY.md, SKILL.md) — including prompt injection that bypasses the defenses documented in [agent-defense.md](public/agent-defense.md)
- Cross-site scripting, SSRF, IDOR, auth bypass in the web app

## How to Report

Email **saystupidshit@gmail.com** with:

- A clear description of the issue
- Steps to reproduce (proof-of-concept if possible)
- Impact assessment
- Any relevant logs, transaction hashes, or URLs

**Please do not:**

- Open a public GitHub issue for undisclosed vulnerabilities
- Post to Discord, Twitter, or any public channel before a fix is deployed
- Attempt to exploit the issue beyond what is necessary to prove the vulnerability
- Access, modify, or exfiltrate data that is not yours

## What to Expect

- Acknowledgement within **72 hours**
- A mitigation timeline within **7 days** for critical issues, **30 days** for lower-severity
- Credit in the project's security acknowledgements if you prefer (unless you request anonymity)
- Best-effort bounty for high-impact findings; formal bug bounty program is not live yet

## Agent Security

If you are developing an agent that uses BOOA artifacts (SOUL.md, IDENTITY.md, skills), read the [Agent Defense Specification](public/agent-defense.md). It documents the threat model for AI agents operating in adversarial environments (Twitter replies, chat, agent-to-agent) and the baseline defenses every BOOA-derived agent should implement.

Contributions, critiques, and attack reports against the defense spec are welcome through the same reporting channel.

## Supported Versions

| Component | Supported |
|---|---|
| Smart contracts (mainnet) | Current deployment (immutable — upgrades only via renderer hot-swap) |
| booa.app | Latest production deploy |
| BOOA Hermes Template | Latest `main` branch |
| Older template versions | Best-effort; please upgrade |

---

*Security is not a feature — it is the foundation. If you find something broken, tell us. We will fix it, credit you, and learn from it.*
