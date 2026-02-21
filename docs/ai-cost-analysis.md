# AI API Cost Analysis — BOOA Agent Generator (V2)

## Overview

V2'de tüm AI pipeline tek bir API çağrısında çalışır: `POST /api/mint-request`. Server tarafında **3 Gemini çağrısı** yapılır, ardından bitmap encode + EIP-191 imzalama gerçekleşir. Kullanıcı AI üretiminden sonra cüzdanla onay verir.

**Kritik:** AI maliyeti üretim anında oluşur, kullanıcı mint'i onaylamasa bile.

---

## API Call Breakdown — `POST /api/mint-request`

### Call 1: Generate Agent Identity

| Field | Value |
|-------|-------|
| **Model** | `gemini-3-flash-preview` |
| **System Instruction** | ~250 tokens (agent identity designer prompt + JSON schema) |
| **User Input** | ~20 tokens (fixed: "Generate a completely random, unique AI agent identity. Surprise me.") |
| **Total Input** | ~270 tokens |
| **Output** | ~300-500 tokens (JSON: name, description, creature, vibe, emoji, personality[], boundaries[], skills[], domains[]) |
| **Thinking Tokens** | ~200-800 tokens (billed as output) |
| **Temperature** | 1.0 |

### Call 2: Generate Portrait Prompt + Visual Traits

| Field | Value |
|-------|-------|
| **Model** | `gemini-3-flash-preview` |
| **System Instruction** | ~600 tokens (avant-garde fashion portrait style guide, critical rules, JSON schema) |
| **User Input** | ~200-400 tokens (agent JSON: name, creature, vibe, personality, skills, domains) |
| **Total Input** | ~800-1000 tokens |
| **Output** | ~150-300 tokens (JSON: prompt string + traits {Hair, Eyes, Facial Hair, Mouth, Accessory, Headwear, Skin}) |
| **Thinking Tokens** | ~200-600 tokens (billed as output) |
| **Temperature** | 0.7 |

### Call 3: Generate Image

| Field | Value |
|-------|-------|
| **Model** | `gemini-2.5-flash-image` |
| **Input** | ~200-400 tokens (enriched portrait prompt with trait details) |
| **Output** | 1 image (1024x1024, ~1290 output tokens) |
| **Pricing** | Flat **$0.039** per output image |

---

## Cost Per Generation

### Pricing Reference (Paid Tier, Feb 2026)

| Model | Input (per 1M tokens) | Output incl. thinking (per 1M tokens) | Image Output |
|-------|----------------------|---------------------------------------|-------------|
| `gemini-3-flash-preview` | $0.50 | $3.00 | N/A |
| `imagen-4.0-fast-generate-001` | N/A | N/A | $0.02/image |

### Text Calls (gemini-3-flash-preview)

| Call | Input Tokens | Output + Thinking | Input Cost | Output Cost | Total |
|------|-------------|-------------------|------------|-------------|-------|
| Agent identity | ~270 | ~800 | $0.000135 | $0.0024 | **$0.0025** |
| Portrait prompt | ~900 | ~600 | $0.000450 | $0.0018 | **$0.0023** |
| **Text subtotal** | **~1,170** | **~1,400** | **$0.000585** | **$0.0042** | **$0.0048** |

### Image Call (imagen-4.0-fast-generate-001)

| Call | Input | Output | Cost |
|------|-------|--------|------|
| Generate image | prompt text | 1 image (1024x1024) | **$0.02** |

### Total Per Generation

| Component | Cost | % of Total |
|-----------|------|------------|
| Text (2 calls) | $0.0048 | 19% |
| Image (1 call) | $0.02 | 81% |
| **Total** | **~$0.025** | 100% |

---

## Spam / Abuse Cost Analysis

### Current Protection

| Protection | Setting |
|------------|---------|
| SIWE auth | Wallet connected + signed in required |
| IP rate limit | 5 requests per 60 seconds |
| Per-wallet quota | **5 generations** per 24h (resets after mint) |
| Wallet quota TTL | 24 hours |

### Worst-Case Spam Scenarios

**Scenario 1: Single spammer (1 wallet)**

| | Value |
|---|---|
| Max generations | 5 (quota limit) |
| Cost | 5 × $0.025 = **$0.125** |
| Recovery | $0 (if they don't mint) |
| Net loss | **$0.125** |

**Scenario 2: Spammer with 10 wallets**

| | Value |
|---|---|
| Max generations | 10 × 5 = 50 |
| Cost | 50 × $0.025 = **$1.25** |
| IP rate limit blocks | After 5/min per IP, slowed down |
| Net loss | **$1.25** (max per 24h per IP) |

**Scenario 3: Distributed spam (100 wallets, multiple IPs)**

| | Value |
|---|---|
| Max generations | 100 × 5 = 500 |
| Cost | 500 × $0.025 = **$12.50** |
| Likelihood | Very low (each needs unique wallet + SIWE) |

### Revenue Recovery

| Mint price | Revenue per mint | Generations covered |
|------------|-----------------|---------------------|
| 0.00015 ETH (~$0.30) | $0.30 | 12 generations |
| 0.001 ETH (~$2.00) | $2.00 | 80 generations |
| 0.005 ETH (~$10.00) | $10.00 | 400 generations |

> **Current mint price (0.00015 ETH ≈ $0.30):** Her mint, ~12 üretimin maliyetini karşılıyor. Kullanıcı 5 deneyip 1 mint yaparsa → $0.125 maliyet, $0.30 gelir = **net kâr**.

---

## Scale Projections (Legitimate Usage)

| Scenario | Generates/day | Text Cost | Image Cost | **Daily Cost** | **Monthly Cost** |
|----------|--------------|-----------|------------|----------------|------------------|
| 50 users × 2/day | 100 | $0.48 | $2.00 | **$2.48** | **$74** |
| 200 users × 3/day | 600 | $2.88 | $12.00 | **$14.88** | **$446** |
| 1,000 users × 3/day | 3,000 | $14.40 | $60.00 | **$74.40** | **$2,232** |
| 5,000 users × 3/day | 15,000 | $72.00 | $300.00 | **$372.00** | **$11,160** |
| 10,000 users × 3/day | 30,000 | $144.00 | $600.00 | **$744.00** | **$22,320** |

### With Mint Revenue (assuming 40% mint rate)

| Scenario | Generates | Mints (40%) | AI Cost | Revenue (0.00015 ETH) | **Net** |
|----------|----------|-------------|---------|----------------------|---------|
| 100/day | 100 | 40 | $2.48 | $12.00 | **+$9.52** |
| 600/day | 600 | 240 | $14.88 | $72.00 | **+$57.12** |
| 3,000/day | 3,000 | 1,200 | $74.40 | $360.00 | **+$285.60** |
| 15,000/day | 15,000 | 6,000 | $372.00 | $1,800.00 | **+$1,428** |

> **Break-even mint rate:** Her kullanıcı ortalama 5 generate × $0.025 = $0.125 harcar. 1 mint = $0.30 gelir. 1 mint / 5 generate = %8.3 mint rate ile break-even.

---

## Alternative Image Models

| Image Model | Cost/Image | vs Current | Notes |
|-------------|-----------|-----------|-------|
| `imagen-4.0-fast-generate-001` (current) | $0.02 | baseline | Fast, cheap |
| `imagen-4-standard` | $0.04 | 2x more | Better quality |
| `imagen-4-ultra` | $0.06 | 3x more | Best quality |
| `gemini-2.5-flash-image` (previous) | $0.039 | 95% more | Good quality but expensive |

---

## Actual Flow

```
User clicks MINT
  │
  POST /api/mint-request (single API call, server-side)
  │
  ├─[1] gemini-3-flash-preview ────────── agent identity ──── ~$0.0025
  │
  ├─[2] gemini-3-flash-preview ────────── portrait prompt ─── ~$0.0023
  │
  ├─[3] imagen-4.0-fast-generate-001 ──── generate image ──── ~$0.02
  │
  ├─[4] Server: pixelate + encode bitmap (no API cost)
  │
  ├─[5] Server: build traits JSON (no API cost)
  │
  └─[6] Server: EIP-191 sign packet (no API cost)
  │
  └─ Response → wallet popup → user confirms or rejects
                                              TOTAL: ~$0.025
```

**Kullanıcı reject ederse:** $0.025 kayıp, ama quota 1 azalır (5 → 4).
**Kullanıcı mint ederse:** $0.025 maliyet, $0.30 gelir, quota sıfırlanır.
