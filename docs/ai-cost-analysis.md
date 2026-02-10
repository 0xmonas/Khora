# AI API Cost Analysis — BOOA Agent Generator

## Overview

Each agent generation triggers **3 sequential Gemini API calls** (Create mode) or **4 calls** (Import mode). This document breaks down the exact models, token estimates, and costs based on actual prompt analysis.

---

## API Call Breakdown (Create Mode)

### Call 1: Generate Agent Identity (`/api/generate-agent`)

| Field | Value |
|-------|-------|
| **Model** | `gemini-3-flash-preview` |
| **System Instruction** | ~180 tokens (agent identity designer prompt + JSON schema) |
| **User Input** | ~30-80 tokens (name + description, user-provided) |
| **Total Input** | ~210-260 tokens |
| **Output** | ~300-500 tokens (JSON with arrays: personality, boundaries, skills, domains) |
| **Thinking Tokens** | ~200-800 tokens (model reasoning, billed as output) |
| **Temperature** | 0.8 |

### Call 2: Generate Portrait Prompt (`/api/generate-prompt`)

| Field | Value |
|-------|-------|
| **Model** | `gemini-3-flash-preview` |
| **System Instruction** | ~120 tokens (pixel art NFT style guide from `STYLES[0]`) |
| **User Input** | ~350-500 tokens (8-point instruction + full agent JSON from `createPortraitPrompt`) |
| **Total Input** | ~470-620 tokens |
| **Output** | ~100-200 tokens (refined visual prompt, max 150 words) |
| **Thinking Tokens** | ~200-600 tokens (billed as output) |
| **Temperature** | 0.7 |

### Call 3: Generate Image (`/api/generate-image`)

| Field | Value |
|-------|-------|
| **Model** | `gemini-2.5-flash-image` |
| **Input** | ~100-200 tokens (portrait prompt text only) |
| **Output** | 1 image (up to 1024x1024 = 1290 output tokens) |
| **Pricing** | Flat $0.039 per output image |

### Import Mode — Additional Call (`/api/enrich-agent`)

| Field | Value |
|-------|-------|
| **Model** | `gemini-3-flash-preview` |
| **System Instruction** | ~200 tokens (enricher prompt + JSON schema) |
| **User Input** | ~50-150 tokens (name + description + skills[] + domains[]) |
| **Total Input** | ~250-350 tokens |
| **Output** | ~300-500 tokens (enriched agent JSON) |
| **Thinking Tokens** | ~200-800 tokens (billed as output) |
| **Temperature** | 0.7 |

---

## Per-Generation Cost (Paid Tier)

### Pricing Reference

| Model | Input (per 1M tokens) | Output incl. thinking (per 1M tokens) | Image Output |
|-------|----------------------|---------------------------------------|-------------|
| `gemini-3-flash-preview` | $0.50 | $3.00 | N/A |
| `gemini-2.5-flash-image` | $0.30 | N/A | $0.039/image |

### Text Calls — Create Mode (gemini-3-flash-preview)

| Call | Input Tokens | Output + Thinking Tokens | Input Cost | Output Cost | Total |
|------|-------------|--------------------------|------------|-------------|-------|
| generate-agent | ~250 | ~800 (400 output + 400 thinking) | $0.000125 | $0.0024 | **$0.0025** |
| generate-prompt | ~550 | ~600 (200 output + 400 thinking) | $0.000275 | $0.0018 | **$0.0021** |
| **Text subtotal** | **~800** | **~1,400** | **$0.0004** | **$0.0042** | **$0.0046** |

### Image Call (gemini-2.5-flash-image)

| Call | Input | Output | Cost |
|------|-------|--------|------|
| generate-image | ~150 tokens text ($0.000045) | 1 image (1290 tokens) | **$0.039** |

### Total Per Generation

| Mode | Text Cost | Image Cost | **Total** |
|------|-----------|------------|-----------|
| **Create** (2 text + 1 image) | $0.0046 | $0.039 | **~$0.044** |
| **Import** (3 text + 1 image) | $0.0071 | $0.039 | **~$0.046** |

> **Note:** Thinking tokens can vary significantly. Worst case, each text call could produce ~1,500 thinking tokens, pushing text cost to ~$0.01. Even then, image generation dominates at ~80-90% of total cost.

---

## Scale Projections

| Scenario | Total Generates | Text Cost | Image Cost | **Total Cost** |
|----------|----------------|-----------|------------|----------------|
| 100 users × 3/day | 300 | $1.38 | $11.70 | **$13.08** |
| 1,000 users × 3/day | 3,000 | $13.80 | $117.00 | **$130.80** |
| 1,000 users × 5/day | 5,000 | $23.00 | $195.00 | **$218.00** |
| 10,000 users × 3/day | 30,000 | $138.00 | $1,170.00 | **$1,308.00** |
| **10,000 users × 5/day** | **50,000** | **$230.00** | **$1,950.00** | **$2,180.00** |
| 50,000 users × 5/day | 250,000 | $1,150.00 | $9,750.00 | **$10,900.00** |

> **Key insight:** ~89% of cost comes from image generation ($0.039/image). Text calls including thinking tokens are ~$0.0046 per generation.

---

## Alternative Image Model Comparison

| Image Model | Cost/Image | 50K generates | vs Current | Notes |
|-------------|-----------|---------------|-----------|-------|
| `gemini-2.5-flash-image` (current) | $0.039 | $1,950 | baseline | Good quality, fast |
| `gemini-2.0-flash` (image mode) | $0.039 | $1,950 | same | Same generation, same price |
| `gemini-3-pro-image-preview` | $0.134 | $6,700 | **3.4x more** | Best quality, very expensive |
| `imagen-4-fast` | $0.02 | $1,000 | **49% cheaper** | Dedicated image model, fast |
| `imagen-4-standard` | $0.04 | $2,000 | ~same | Better quality than fast |

---

## Free Tier Availability

| Model | Free Tier | Limitation |
|-------|-----------|-----------|
| `gemini-3-flash-preview` (text) | Yes, free | 10 RPM, data used to improve products |
| `gemini-2.5-flash-image` | **Not available** | Paid tier only for image output |
| `imagen-4-fast` | **Not available** | Paid tier only |

> You are currently on paid tier (image generation wouldn't work on free tier).

---

## Actual Flow Summary

```
User clicks "Generate"
  │
  ├─[1] POST /api/generate-agent ──── gemini-3-flash-preview ──── ~$0.0025
  │     (name + desc → agent JSON)
  │
  ├─[2] POST /api/generate-prompt ─── gemini-3-flash-preview ──── ~$0.0021
  │     (agent JSON → visual prompt)
  │
  └─[3] POST /api/generate-image ──── gemini-2.5-flash-image ──── ~$0.039
        (visual prompt → pixel art PNG)
                                                          TOTAL: ~$0.044
```

---

## Recommendations

### Option A: Rate Limit per Wallet (Simple)
- 3-5 generates per wallet per day via server-side tracking
- **Max daily exposure** (10K wallets × 5): ~$2,180/day
- Pro: Easy, fast to implement
- Con: Multiple wallets bypass it, cost not recovered

### Option B: Mint-Gated Generation (Zero Loss)
- User signs mint tx first → tx confirms → API generates
- Set mint price ≥ $0.05 to cover API cost + margin
- Pro: Every generate is paid for, zero abuse
- Con: User pays before seeing result

### Option C: Free First + Paid Regenerate (Best UX)
- 1st generate per wallet: **free** (costs you ~$0.044)
- Regenerate or new agent: requires on-chain payment first
- Pro: User sees result before committing money
- Con: First generate is subsidized

### Option D: Switch Image Model (Cost Optimization)
- `gemini-2.5-flash-image` → `imagen-4-fast-generate-001`
- Per-generate cost: $0.044 → ~$0.025 (**43% total reduction**)
- Combine with any rate limiting option above
- Note: Different API, may need code changes for Imagen 4

### Option E: Hybrid — Rate Limit + Imagen 4 Fast (Recommended)
- Switch to `imagen-4-fast` ($0.02/image)
- Rate limit: 3 free generates per wallet per day
- After limit: require on-chain payment to continue
- **Cost per generate: ~$0.025**
- **Max daily exposure** (10K wallets × 3): ~$750/day
