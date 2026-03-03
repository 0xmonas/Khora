# AI API Cost Analysis — BOOA Agent Generator (V2)

## Overview

V2'de tüm AI pipeline tek bir API çağrısında çalışır: `POST /api/mint-request`. Server tarafında **3 Gemini çağrısı** yapılır, ardından bitmap encode + EIP-191 imzalama gerçekleşir. Kullanıcı AI üretiminden sonra cüzdanla onay verir.

**Kritik:** AI maliyeti üretim anında oluşur, kullanıcı mint'i onaylamasa bile.

---

## API Call Breakdown — `POST /api/mint-request`

### Call 1: Generate Agent Identity + Portrait Prompt + Visual Traits (Combined)

| Field | Value |
|-------|-------|
| **Model** | `gemini-3-flash-preview` |
| **System Instruction** | ~700 tokens (combined: agent identity + portrait style guide + JSON schema) |
| **User Input** | ~25 tokens (fixed prompt) |
| **Total Input** | ~725 tokens |
| **Output** | ~500-800 tokens (single JSON: agent fields + portraitPrompt + visualTraits) |
| **Thinking Tokens** | ~300-1000 tokens (billed as output) |
| **Temperature** | 1.0 |

> **Optimization:** Previously 2 separate calls (agent identity + portrait prompt). Merged into 1 call, saving ~2-4s API round-trip latency.

### Call 2: Generate Image (with Reference)

| Field | Value |
|-------|-------|
| **Model** | `gemini-2.5-flash-image` |
| **Input — Reference Image** | ~258 tokens (ref.png, 512x512, single tile) |
| **Input — Text Prompt** | ~200-400 tokens (enriched portrait prompt with trait details + reference instruction) |
| **Total Input** | ~458-658 tokens |
| **Output** | 1 image (1024x1024, ~1290 output tokens) |
| **Pricing** | Flat **$0.039** per output image + input token cost |

> **Reference Image:** `public/ref.png` (512x512 PNG, white silhouette face on black background) server boot'ta base64'e çevrilir ve her image generation çağrısına `inlineData` olarak eklenir. Gemini'da ≤768px image = 258 token = tek tile.

---

## Cost Per Generation

### Pricing Reference (Paid Tier, March 2026)

| Model | Input (per 1M tokens) | Output incl. thinking (per 1M tokens) | Image Output |
|-------|----------------------|---------------------------------------|-------------|
| `gemini-3-flash-preview` | $0.50 | $3.00 | N/A |
| `gemini-2.5-flash-image` | $0.30 | $30.00 (image tokens) | ~$0.039/image (1290 tokens) |

### Text Call (gemini-3-flash-preview) — Combined

| Call | Input Tokens | Output + Thinking | Input Cost | Output Cost | Total |
|------|-------------|-------------------|------------|-------------|-------|
| Agent + portrait + traits (combined) | ~725 | ~1,200 | $0.000363 | $0.0036 | **$0.0040** |

> **vs. Eski (2 ayrı call):** $0.0048 → $0.0040 (-%17). Tek çağrıda system instruction tekrarı yok, toplam token kullanımı düşer.

### Image Call (gemini-2.5-flash-image)

| Call | Input Tokens | Output | Input Cost | Output Cost | Total |
|------|-------------|--------|------------|-------------|-------|
| Generate image | ~558 (258 ref image + ~300 text) | 1 image (1290 tokens) | $0.000167 | $0.039 | **$0.039** |

### Total Per Generation

| Component | Cost | % of Total |
|-----------|------|------------|
| Text (1 combined call) | $0.0040 | 9% |
| Image (1 call) | $0.039 | 91% |
| **Total** | **~$0.043** | 100% |

> **Optimizasyon etkisi:** 3 API call → 2 API call. Maliyet $0.044 → $0.043 (marginal). Asıl kazanım **latency**: ~2-4 saniye API round-trip tasarrufu.

---

## Spam / Abuse Cost Analysis

### Current Protection

| Protection | Setting |
|------------|---------|
| SIWE auth | Wallet connected + signed in required |
| IP rate limit | 5 requests per 60 seconds |
| Per-wallet quota | **10 generations** per 24h (2x maxPerWallet) |
| Wallet quota TTL | 24 hours |
| maxPerWallet (on-chain) | 5 mints |

### Worst-Case Spam Scenarios

**Scenario 1: Single spammer (1 wallet)**

| | Value |
|---|---|
| Max generations | 10 (quota limit) |
| Cost | 10 × $0.044 = **$0.44** |
| Recovery | $0 (if they don't mint) |
| Net loss | **$0.44** |

**Scenario 2: Spammer with 10 wallets**

| | Value |
|---|---|
| Max generations | 10 × 10 = 100 |
| Cost | 100 × $0.044 = **$4.40** |
| IP rate limit blocks | After 5/min per IP, slowed down |
| Net loss | **$4.40** (max per 24h per IP) |

**Scenario 3: Distributed spam (100 wallets, multiple IPs)**

| | Value |
|---|---|
| Max generations | 100 × 10 = 1,000 |
| Cost | 1,000 × $0.044 = **$44.00** |
| Likelihood | Very low (each needs unique wallet + SIWE) |

### Revenue Recovery

| Mint price | Revenue per mint | Generations covered |
|------------|-----------------|---------------------|
| 0.00042 ETH (~$0.84) | $0.84 | ~19 generations |
| 0.00069 ETH (~$1.38) | $1.38 | ~31 generations |
| 0.001 ETH (~$2.00) | $2.00 | ~45 generations |
| 0.005 ETH (~$10.00) | $10.00 | ~227 generations |

> **Allowlist price (0.00042 ETH ≈ $0.84):** Her mint ~19 üretimin maliyetini karşılıyor. Kullanıcı 10 deneyip 1 mint yaparsa → $0.44 maliyet, $0.84 gelir = **net kâr**.
>
> **Public price (0.00069 ETH ≈ $1.38):** Her mint ~31 üretimin maliyetini karşılıyor.

---

## Scale Projections (Legitimate Usage)

| Scenario | Generates/day | Text Cost | Image Cost | **Daily Cost** | **Monthly Cost** |
|----------|--------------|-----------|------------|----------------|------------------|
| 50 users × 2/day | 100 | $0.48 | $3.90 | **$4.38** | **$131** |
| 200 users × 3/day | 600 | $2.88 | $23.40 | **$26.28** | **$788** |
| 1,000 users × 3/day | 3,000 | $14.40 | $117.00 | **$131.40** | **$3,942** |
| 5,000 users × 3/day | 15,000 | $72.00 | $585.00 | **$657.00** | **$19,710** |
| 10,000 users × 3/day | 30,000 | $144.00 | $1,170.00 | **$1,314.00** | **$39,420** |

### With Mint Revenue (assuming 40% mint rate, public price)

| Scenario | Generates | Mints (40%) | AI Cost | Revenue (0.00069 ETH) | **Net** |
|----------|----------|-------------|---------|----------------------|---------|
| 100/day | 100 | 40 | $4.38 | $55.20 | **+$50.82** |
| 600/day | 600 | 240 | $26.28 | $331.20 | **+$304.92** |
| 3,000/day | 3,000 | 1,200 | $131.40 | $1,656.00 | **+$1,524.60** |
| 15,000/day | 15,000 | 6,000 | $657.00 | $8,280.00 | **+$7,623** |

> **Break-even mint rate:** Her kullanıcı ortalama 10 generate × $0.044 = $0.44 harcar. 1 mint (public) = $1.38 gelir. 1 mint / 10 generate = **%10 mint rate ile break-even**.

---

## Cost Optimization Options

### Option 1: Batch API (50% image cost savings)

`gemini-2.5-flash-image` Batch API ile $0.039 → $0.0195/image. Ancak Batch API 24 saat içinde işler — real-time mint flow için uygun değil.

### Option 2: imagen-4.0-fast-generate-001'e Geri Dön

| | gemini-2.5-flash-image | imagen-4.0-fast |
|---|---|---|
| Cost/image | $0.039 | $0.02 |
| Reference image | Destekler (inlineData) | Desteklemez |
| Quality | Daha iyi | İyi |
| Total/generation | $0.044 | $0.025 |

> **Trade-off:** imagen-4.0-fast %43 daha ucuz ama reference image desteklemiyor. Reference image tutarlılığı önemliyse gemini-2.5-flash-image kalmalı.

### Option 3: Thinking Token Optimizasyonu

`gemini-3-flash-preview` thinking token'ları output fiyatıyla faturalanıyor ($3/1M). `thinkingConfig.thinkingBudget` ile sınırlanabilir ancak yaratıcı çıktı kalitesini düşürebilir.

---

## Alternative Image Models Comparison

| Image Model | Cost/Image | vs Current | Reference Image | Notes |
|-------------|-----------|-----------|-----------------|-------|
| `gemini-2.5-flash-image` (current) | $0.039 | baseline | Destekler | İyi kalite, ref image desteği |
| `imagen-4.0-fast-generate-001` | $0.02 | %49 ucuz | Desteklemez | Hızlı, ucuz, ref image yok |
| `imagen-4-standard` | $0.04 | %3 pahalı | Desteklemez | Daha iyi kalite |
| `imagen-4-ultra` | $0.06 | %54 pahalı | Desteklemez | En iyi kalite |

---

## Actual Flow

```
User clicks MINT
  │
  POST /api/mint-request (single API call, server-side)
  │
  ├─[1] gemini-3-flash-preview ────────── agent + portrait + traits ── ~$0.004  (3-5s)
  │     └─ Combined: identity, portraitPrompt, visualTraits in one JSON
  │
  ├─[2] gemini-2.5-flash-image ────────── generate image ───────────── ~$0.039  (8-12s)
  │     └─ input: ref.png (258 tokens) + enriched prompt (~300 tokens)
  │     └─ output: 1024x1024 image (1290 tokens)
  │
  ├─[3] Server: pixelate + encode bitmap (parallel, no API cost)       (~0.5-1s)
  │
  ├─[4] Server: build traits JSON + EIP-191 sign packet                (~0ms)
  │
  └─ Response → wallet popup → user confirms or rejects
                                      TOTAL: ~$0.043, ~11-17s
```

**vs. Eski flow (3 API calls):** ~14-20s → ~11-17s (**~2-4s daha hızlı**)

**Kullanıcı reject ederse:** $0.043 kayıp, ama quota 1 azalır (10 → 9).
**Kullanıcı mint ederse:** $0.043 maliyet, $0.84-$1.38 gelir (allowlist/public), quota sıfırlanır.

---

## Key Differences vs. Previous Versions

| | v1 (imagen) | v2 (3 call) | v3 (2 call, güncel) | Fark (v1→v3) |
|---|---|---|---|---|
| API calls | 3 | 3 | **2** | -1 call |
| Image model | `imagen-4.0-fast` | `gemini-2.5-flash-image` | `gemini-2.5-flash-image` | Kalite artışı |
| Reference image | Yok | Var | Var | Tutarlılık |
| Cost per generation | ~$0.025 | ~$0.044 | **~$0.043** | +72% |
| Latency | ~14-20s | ~14-20s | **~11-17s** | -2-4s |
| Per-wallet quota | 5 | 10 | 10 | 2x maxPerWallet |
| maxPerWallet | 10 | 5 | 5 | Azaltıldı |
| Bitmap processing | Sequential | Sequential | **Parallel** | -0.5s |

> **Sonuç:** v3 pipeline aynı maliyet ve kalitede ~2-4 saniye daha hızlı. 3 API çağrısı 2'ye düşürüldü (agent identity + portrait prompt birleştirildi), bitmap işlemleri paralelleştirildi.
