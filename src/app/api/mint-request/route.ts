import { NextRequest, NextResponse } from 'next/server';
import { toHex } from 'viem';
import type { Hex } from 'viem';
import { GoogleGenAI } from '@google/genai';
import Replicate from 'replicate';
import { generationLimiter, getIP, rateLimitHeaders, checkGenerationQuota, incrementGenerationCount, GEN_QUOTA_MAX, checkDailyCap, incrementDailyCap } from '@/lib/ratelimit';
import { signMintPacket, createDeadline } from '@/lib/server/signer';
import { encodeBitmapServer, pixelateImageServer } from '@/lib/server/bitmap';

// Reuse AI client across requests (module-level singleton)
let _ai: InstanceType<typeof GoogleGenAI> | null = null;
function getAI(): InstanceType<typeof GoogleGenAI> {
  if (!_ai) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  return _ai;
}

// Replicate client singleton
let _replicate: Replicate | null = null;
function getReplicate(): Replicate {
  if (!_replicate) {
    if (!process.env.REPLICATE_API_TOKEN) throw new Error('REPLICATE_API_TOKEN not configured');
    _replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  }
  return _replicate;
}

const FLUX_LORA_MODEL = '0xmonas/y2:418c546e6143c2f46c6e774a625472e6ae71e78bac4d5cadede1ce3d31d3700d' as const;

export const maxDuration = 300; // AI pipeline: Gemini + Replicate + encoding (~30-60s typical)

const MODEL_TEXT = 'gemini-3-flash-preview';

// Fixed reference prefix — every image prompt MUST start with this exact phrase
const PORTRAIT_REFERENCE_PREFIX = 'A clean retro digital illustration portrait in PC-98 and C64 aesthetic, featuring flat color blocks with bold clean outlines, limited color palette with 2-5 dominant saturated colors, hard-edged cel-shading with no smooth gradients, front-facing shoulders-up composition looking directly at the viewer with face and upper body clearly visible, clean crisp linework, no glitch effects, no distortion, no noise artifacts';

// ── Combined system prompt: agent identity + portrait prompt + visual traits in ONE call ──

const COMBINED_SYSTEM_PROMPT = `You are an AI agent identity designer AND retro digital portrait artist. In a single response, you will:
1. Invent a completely unique AI agent identity from scratch
2. Write a detailed portrait prompt for that agent in PC-98/C64 retro style
3. Define the agent's visual traits

Return ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "name": "string (creative, memorable agent name — can be abstract, sci-fi, mythological, playful, or edgy)",
  "description": "string (1-2 sentences describing what this agent does and its personality)",
  "creature": "string (what kind of entity — invent something truly original)",
  "vibe": "string (communication style — invent a unique one each time)",
  "emoji": "string (single emoji that represents this agent)",
  "personality": ["string array of 4-6 core behavior principles"],
  "boundaries": ["string array of 3-5 things this agent refuses to do"],
  "skills": ["string array of 4-8 capabilities"],
  "domains": ["string array of 3-6 areas of expertise"],
  "services": [],
  "portraitPrompt": "string (detailed image prompt — MUST start with this exact phrase: '${PORTRAIT_REFERENCE_PREFIX}', then continue with character-specific description)",
  "visualTraits": {
    "Hair": "string (derived from character)",
    "Eyes": "string (derived from character)",
    "Facial Hair": "string (derived from character or None)",
    "Mouth": "string (derived from character)",
    "Accessory": "string (derived from character or None)",
    "Headwear": "string (derived from character or None)",
    "Skin": "string (MUST be a bright/vivid color, NEVER dark/black/charred)"
  }
}

AGENT IDENTITY RULES:
- The creature type is ENTIRELY your creative decision. Do not follow any predefined list or category system. Invent something truly original each time — something that has never been described before.
- Do NOT reuse common/overused creatures like fox, wolf, dragon, owl, phoenix, jellyfish, octopus, whale, golem, wraith. Go beyond the obvious.
- Do NOT default to dark/gothic/void/shadow themes. Each agent should have a completely different emotional tone and aesthetic — surprise yourself.
- Each agent must feel like it belongs to a completely different universe than the last one. No two agents should share the same genre, mood, or visual language.

PORTRAIT PROMPT RULES:
- The portraitPrompt MUST begin with the exact reference style phrase shown above. Then continue with character-specific description.
- Retro digital art / pixel art illustration style — flat color blocks with bold outlines
- Think: PC-98 visual novel portraits, C64 demo scene art, early Amiga graphics, retro anime pixel art
- Flat shading with minimal gradients — use hard-edged color areas, NOT smooth photorealistic rendering
- Limited color palette feel — 2-5 dominant colors per character, high contrast between them
- Front-facing composition — character looks DIRECTLY at the viewer, face and upper body clearly visible
- NEVER side profile, 3/4 profile, or turned away — always a direct frontal view
- Bold, saturated colors with high contrast — neons, pastels, vivid primaries
- Skin/surface colors: ALWAYS bright — pastel pink, electric blue, coral, lavender, mint green, pearl white, magenta, turquoise, warm copper, candy red, pale yellow
- Even "dark" themed characters must have vivid color accents
- Do NOT mention any background color in your portraitPrompt

ABSOLUTELY FORBIDDEN in portraitPrompt:
- Photorealistic rendering, smooth gradients, 3D/CGI look
- Muddy, dull, or desaturated palettes
- Glitch effects, VHS artifacts, scan lines, noise, distortion
- Side profile, back view, turned-away poses
- Classical bust or sculpture look

CHARACTER INTERPRETATION:
- Derive EVERYTHING from the agent identity you created. Name, creature, vibe, personality, skills, domains should drive every visual decision.
- Be specific about what you're drawing. NEVER say "a figure" or "a being" — describe the actual creature/entity.
- The portraitPrompt and visualTraits must be fully consistent with the agent identity above them.

Output ONLY the JSON object. No markdown fences, no explanation.`;

// ── Route handler ──

export async function POST(request: NextRequest) {
  try {
    // ── Global daily cap (hard spending limit) ──
    const daily = await checkDailyCap();
    if (!daily.allowed) {
      return NextResponse.json(
        { error: 'Daily generation limit reached. Please try again tomorrow.' },
        { status: 503 },
      );
    }

    // ── Rate limiting ──
    const ip = getIP(request);
    const rl = await generationLimiter.limit(ip);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many requests — please wait before generating again' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    // ── Wallet auth + quota ──
    const walletAddress = request.headers.get('x-siwe-address');
    if (!walletAddress) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }
    const quota = await checkGenerationQuota(walletAddress);
    if (!quota.allowed) {
      return NextResponse.json(
        { error: `Generation limit reached (${GEN_QUOTA_MAX} per 24h). Please try again later.` },
        { status: 429 },
      );
    }

    // ── Validate env ──
    if (!process.env.SIGNER_PRIVATE_KEY) {
      return NextResponse.json({ error: 'SIGNER_PRIVATE_KEY not configured' }, { status: 500 });
    }

    const ai = getAI();
    const t0 = Date.now();

    // ══════════════════════════════════════════════════
    //  STEP 1: Generate agent identity + portrait prompt + visual traits (SINGLE CALL)
    // ══════════════════════════════════════════════════

    const combinedResponse = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: [{ role: 'user', parts: [{ text: 'Generate a completely random, unique AI agent identity with its portrait prompt and visual traits. Surprise me.' }] }],
      config: { systemInstruction: COMBINED_SYSTEM_PROMPT, temperature: 1.0 },
    });

    const combinedText = combinedResponse.text?.trim();
    if (!combinedText) throw new Error('No response from Gemini');

    let jsonStr = combinedText;
    if (jsonStr.includes('```json')) jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
    else if (jsonStr.includes('```')) jsonStr = jsonStr.split('```')[1].split('```')[0].trim();

    const parsed = JSON.parse(jsonStr);
    if (!parsed.name || !parsed.description || !parsed.creature) throw new Error('Incomplete agent data');

    const t1 = Date.now();
    console.log(`[mint] STEP 1 (Gemini text): ${t1 - t0}ms`);

    // Extract agent identity fields
    const agent = {
      name: parsed.name,
      description: parsed.description,
      creature: parsed.creature,
      vibe: parsed.vibe || '',
      emoji: parsed.emoji || '',
      personality: parsed.personality || [],
      boundaries: parsed.boundaries || [],
      skills: parsed.skills || [],
      domains: parsed.domains || [],
      services: [] as string[],
    };

    // Extract portrait prompt
    let portraitPrompt: string = parsed.portraitPrompt || '';
    const visualTraits: Record<string, string> = parsed.visualTraits || {};

    if (!portraitPrompt || portraitPrompt.length < 10) {
      portraitPrompt = `${PORTRAIT_REFERENCE_PREFIX}, depicting a ${agent.creature} named ${agent.name} with ${agent.vibe} energy.`;
    }

    // Ensure the reference prefix is always present (Gemini may skip it)
    if (!portraitPrompt.includes('retro digital illustration portrait')) {
      portraitPrompt = `${PORTRAIT_REFERENCE_PREFIX}. ${portraitPrompt}`;
    }

    // Strip any background mentions the AI may have added
    portraitPrompt = portraitPrompt.replace(/\b(solid|flat|plain|pure)?\s*(black|red|yellow|green|white|grey|gray|blue|navy|dark)\s*background\b/gi, '').trim();

    // Enrich with trait details
    const traitLines = Object.entries(visualTraits)
      .filter(([, v]) => v && v !== 'None' && v !== 'none')
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    let enrichedPrompt = traitLines ? `${portraitPrompt} Character details: ${traitLines}.` : portraitPrompt;

    // Force black background — always
    enrichedPrompt += ` Solid black background, no gradient, no scenery.`;

    // ══════════════════════════════════════════════════
    //  STEP 2: Generate image via Replicate FLUX + LoRA
    // ══════════════════════════════════════════════════

    const replicate = getReplicate();

    const fluxInput: Record<string, unknown> = {
      prompt: enrichedPrompt,
      model: 'dev',
      num_outputs: 1,
      aspect_ratio: '1:1',
      output_format: 'png',
      output_quality: 90,
      guidance_scale: 3.5,
      num_inference_steps: 28,
      lora_scale: 1,
      disable_safety_checker: true,
    };

    // Community model with Cancel-After deadline (GPU auto-cancels if not done in 2min)
    const REPLICATE_DEADLINE = '2m';
    const replicateToken = process.env.REPLICATE_API_TOKEN!;
    const modelVersion = FLUX_LORA_MODEL.split(':')[1];

    const predictionResp = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${replicateToken}`,
        'Content-Type': 'application/json',
        'Cancel-After': REPLICATE_DEADLINE,
        'Prefer': 'wait',
      },
      body: JSON.stringify({ version: modelVersion, input: fluxInput }),
    });

    if (!predictionResp.ok) {
      const errBody = await predictionResp.text();
      throw new Error(`Replicate API error ${predictionResp.status}: ${errBody}`);
    }

    let prediction = await predictionResp.json();

    // If prediction hasn't completed yet (Prefer: wait timed out), poll until done
    if (prediction.status !== 'succeeded') {
      if (prediction.status === 'canceled' || prediction.status === 'aborted') {
        throw new Error('Image generation timed out. Please try again.');
      }
      if (prediction.status === 'failed') {
        throw new Error(`Image generation failed: ${prediction.error || 'unknown error'}`);
      }
      // Poll with replicate SDK
      prediction = await replicate.wait(prediction);
      if (prediction.status === 'canceled' || prediction.status === 'aborted') {
        throw new Error('Image generation timed out. Please try again.');
      }
      if (prediction.status !== 'succeeded') {
        throw new Error(`Image generation failed: ${prediction.error || 'unknown error'}`);
      }
    }

    const fluxOutput = prediction.output;
    if (!fluxOutput || !Array.isArray(fluxOutput) || fluxOutput.length === 0) throw new Error('No image generated');
    const imageUrl = fluxOutput[0];
    console.log(`[mint] STEP 2 (Replicate community, deadline=${REPLICATE_DEADLINE}): ${Date.now() - t1}ms`);

    // ── DEPLOYMENT (uncomment to use dedicated GPU instead of community) ──
    // const deployOwner = process.env.REPLICATE_DEPLOYMENT_OWNER;
    // const deployName = process.env.REPLICATE_DEPLOYMENT_NAME;
    // if (deployOwner && deployName) {
    //   const prediction = await replicate.deployments.predictions.create(
    //     deployOwner, deployName, { input: fluxInput },
    //   );
    //   const completed = await replicate.wait(prediction);
    //   if (completed.status === 'failed') throw new Error(`Replicate prediction failed: ${completed.error}`);
    //   const output = completed.output as string[];
    //   if (!output || output.length === 0) throw new Error('No image generated from deployment');
    //   imageUrl = output[0];
    //   console.log(`[mint] STEP 2 (Replicate Deployment ${deployOwner}/${deployName}): ${Date.now() - t1}ms`);
    // }

    const t2 = Date.now();
    let imageBuffer: Buffer;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const imageResp = await fetch(imageUrl);
        if (!imageResp.ok) throw new Error(`HTTP ${imageResp.status}`);
        imageBuffer = Buffer.from(await imageResp.arrayBuffer());
        break;
      } catch (dlErr) {
        if (attempt === 2) throw new Error('Failed to download generated image after 3 attempts');
        console.warn(`[mint] Image download attempt ${attempt + 1} failed, retrying in 1s...`, dlErr);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
    const base64Image = `data:image/png;base64,${imageBuffer!.toString('base64')}`;

    // ══════════════════════════════════════════════════
    //  STEP 3: Pixelate + encode bitmap (parallel)
    // ══════════════════════════════════════════════════

    const [pixelatedImage, bitmapBytes] = await Promise.all([
      pixelateImageServer(base64Image),
      encodeBitmapServer(base64Image),
    ]);

    const t3 = Date.now();
    console.log(`[mint] STEP 3 (pixelate+bitmap): ${t3 - t2}ms`);

    // ══════════════════════════════════════════════════
    //  STEP 4: Build traits JSON + sign packet
    // ══════════════════════════════════════════════════

    const attributes: Array<{ trait_type: string; value: string }> = [];
    if (agent.name) attributes.push({ trait_type: 'Name', value: agent.name });
    if (agent.description) attributes.push({ trait_type: 'Description', value: agent.description });
    if (agent.creature) attributes.push({ trait_type: 'Creature', value: agent.creature });
    if (agent.vibe) attributes.push({ trait_type: 'Vibe', value: agent.vibe });
    if (agent.emoji) attributes.push({ trait_type: 'Emoji', value: agent.emoji });
    for (const s of agent.skills) attributes.push({ trait_type: 'Skill', value: s });
    for (const d of agent.domains) attributes.push({ trait_type: 'Domain', value: d });
    for (const p of agent.personality) attributes.push({ trait_type: 'Personality', value: p });
    for (const b of agent.boundaries) attributes.push({ trait_type: 'Boundary', value: b });

    for (const [traitType, value] of Object.entries(visualTraits)) {
      if (value && value !== 'None' && value !== 'none') {
        attributes.push({ trait_type: traitType, value: value as string });
      }
    }
    attributes.push({ trait_type: 'Palette', value: 'C64' });

    const traitsJSON = JSON.stringify(attributes);
    const traitsBytes = new TextEncoder().encode(traitsJSON);

    const imageDataHex = toHex(bitmapBytes);
    const traitsDataHex = toHex(traitsBytes);
    const minterAddress = walletAddress as Hex;
    const deadline = createDeadline(); // 10 minutes (default in signer.ts)
    const chainId = BigInt(process.env.NEXT_PUBLIC_TARGET_CHAIN_ID || '11011'); // Shape Sepolia default

    const signature = await signMintPacket(imageDataHex, traitsDataHex, minterAddress, deadline, chainId);

    // ── Quotas: count generation + daily cap (no reset — wallet has 6 total lifetime) ──
    await incrementGenerationCount(walletAddress);
    await incrementDailyCap();

    // ══════════════════════════════════════════════════
    //  STEP 5: Return signed packet to frontend
    // ══════════════════════════════════════════════════

    const tTotal = Date.now();
    console.log(`[mint] TOTAL: ${tTotal - t0}ms | text=${t1 - t0}ms flux=${t2 - t1}ms bitmap=${t3 - t2}ms sign=${tTotal - t3}ms`);

    return NextResponse.json({
      // Data for contract call
      imageData: imageDataHex,
      traitsData: traitsDataHex,
      deadline: deadline.toString(),
      signature,
      // Data for frontend display
      agent: { ...agent, image: pixelatedImage },
      pixelatedImage,
      visualTraits,
      quotaRemaining: quota.remaining - 1,
    });
  } catch (error) {
    console.error('mint-request error:', error);
    const message = error instanceof Error ? error.message : 'Failed to generate mint data';
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
