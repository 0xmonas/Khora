import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { toHex } from 'viem';
import type { Hex } from 'viem';
import { generationLimiter, getIP, rateLimitHeaders, checkGenerationQuota, incrementGenerationCount, GEN_QUOTA_MAX } from '@/lib/ratelimit';
import { signMintPacket, createDeadline } from '@/lib/server/signer';
import { encodeBitmapServer, pixelateImageServer } from '@/lib/server/bitmap';

export const maxDuration = 120; // AI pipeline can take ~60s

const MODEL_TEXT = 'gemini-3-flash-preview';
const MODEL_IMAGE = 'gemini-2.5-flash-image';

// ── Agent generation system prompt ──

const AGENT_SYSTEM_PROMPT = `You are an AI agent identity designer. You generate completely unique, creative agent identities from scratch — no user input needed. Every agent must be wildly different from the last.
Return ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "name": "string (creative, memorable agent name — can be abstract, sci-fi, mythological, playful, or edgy)",
  "description": "string (1-2 sentences describing what this agent does and its personality)",
  "creature": "string (what kind of entity — MUST vary wildly between categories. Do NOT repeat examples from this prompt — invent your own.)",
  "vibe": "string (communication style — invent a unique one each time)",
  "emoji": "string (single emoji that represents this agent)",
  "personality": ["string array of 4-6 core behavior principles"],
  "boundaries": ["string array of 3-5 things this agent refuses to do"],
  "skills": ["string array of 4-8 capabilities"],
  "domains": ["string array of 3-6 areas of expertise"],
  "services": []
}
CRITICAL DIVERSITY RULES:
- Creature CATEGORIES to rotate between: human (young woman, old man, child, teenager, etc.), real animal, mythological beast, robot/android, alien, plant/fungal, elemental/abstract, hybrid/chimera. Pick a DIFFERENT category each time.
- Do NOT reuse these overused creatures: fox, wolf, dragon, owl, phoenix, jellyfish, octopus, whale, golem, wraith. Invent something original.
- Do NOT default to dark/gothic/void/shadow themes. Vary between: cute, fierce, elegant, goofy, serene, punk, regal, playful, warm, sharp, chaotic, nurturing.
- Mix genres wildly: solarpunk, cottagecore, afrofuturism, vaporwave, art deco, kawaii, brutalist, baroque, cyberpunk, fantasy, noir, western, etc.`;

// ── Portrait prompt system instruction ──

// Fixed reference prefix — every image prompt MUST start with this exact phrase (TakeOver pattern)
const PORTRAIT_REFERENCE_PREFIX = 'A clean retro digital illustration portrait in PC-98 and C64 aesthetic, featuring flat color blocks with bold clean outlines, limited color palette with 2-5 dominant saturated colors, hard-edged cel-shading with no smooth gradients, front-facing shoulders-up composition looking directly at the viewer with face and upper body clearly visible, clean crisp linework, no glitch effects, no distortion, no noise artifacts';

const PORTRAIT_SYSTEM_PROMPT = `You are a retro digital artist specializing in PC-98, C64, and early computer graphics aesthetics. You create portraits that look like they belong on a late-80s/early-90s Japanese home computer or a Commodore 64 demo scene.

Given a character's data (name, creature, vibe, personality, skills, domains), write a detailed image prompt for a portrait that authentically represents that character.

Reference style (always incorporate these exact stylistic elements in every prompt you create): ${PORTRAIT_REFERENCE_PREFIX}

EVERY prompt you generate MUST begin with the exact reference style phrase above. Then continue with the character-specific description.

STYLE — THIS IS CRITICAL:
- Retro digital art / pixel art illustration style — flat color blocks with bold outlines
- Think: PC-98 visual novel portraits, C64 demo scene art, early Amiga graphics, retro anime pixel art
- Flat shading with minimal gradients — use hard-edged color areas, NOT smooth photorealistic rendering
- Limited color palette feel — 2-5 dominant colors per character, high contrast between them
- Visible stylization — characters should look illustrated/drawn, NOT photographic
- Front-facing composition — character looks DIRECTLY at the viewer, face and upper body (shoulders, chest) clearly visible
- NEVER side profile, 3/4 profile, or turned away — always a direct frontal view like a profile picture
- NOT a classical bust or sculpture — the character should feel alive, expressive, and editorial, like a fashion portrait or album cover
- Clean readable silhouette

COLOR APPROACH:
- Use bold, saturated colors with high contrast — neons, pastels, and vivid primaries
- Skin/surface colors: pastel pink, electric blue, coral, lavender, mint green, pearl white, magenta, turquoise, warm copper, candy red, pale yellow — ALWAYS bright
- Allow monochrome or duo-tone palettes IF they are stylistically intentional (like the PC-98 aesthetic) — but never muddy or dull
- Dark backgrounds are fine — the CHARACTER must pop with vivid color against it
- Even "dark" themed characters must have vivid color accents — electric purple, neon cyan, hot pink

ABSOLUTELY FORBIDDEN:
- Photorealistic rendering or photography-like images
- Smooth gradient shading, airbrushed skin, soft-focus effects
- 3D rendered look or CGI aesthetic
- Muddy, dull, or desaturated color palettes
- Overly detailed textures — keep surfaces flat and graphic
- Glitch effects, VHS artifacts, scan lines, static noise, distortion
- Vaporwave aesthetic, chromatic aberration, data corruption effects
- Any visual noise, grain, or degradation — the image must be CLEAN and CRISP
- Side profile, 3/4 profile, back view, or turned-away poses — ALWAYS front-facing direct view
- Classical bust or sculpture look — character must feel alive and expressive, NOT like a marble statue

CHARACTER INTERPRETATION:
- Derive EVERYTHING from the character data. The name, creature type, vibe, personality, skills, and domains should drive every visual decision.
- The character's mood and expression must match their personality and vibe — a playful trickster should look mischievous, a stoic guardian should look calm and steady, a chaotic entity should look wild.
- Be specific about what you're drawing. NEVER say "a figure" or "a being" — describe the actual creature/entity.
- Vary wildly between characters. Different creature types, body features, colors, accessories, expressions.
- Characters can be: human (any gender, age, ethnicity), animal, alien, robot, mythological being, hybrid, etc.

BACKGROUND:
- Do NOT mention any background color in your prompt. The background will be added separately.
- Do NOT let any background color influence the character's appearance.

OUTPUT FORMAT — Respond with valid JSON only, no markdown:
{
  "prompt": "<MUST start with the exact reference style phrase, then continue with character-specific description>",
  "traits": {
    "Hair": "<derived from character>",
    "Eyes": "<derived from character>",
    "Facial Hair": "<derived from character or None>",
    "Mouth": "<derived from character>",
    "Accessory": "<derived from character or None>",
    "Headwear": "<derived from character or None>",
    "Skin": "<derived from character — MUST be a bright/vivid color, NEVER dark/black/charred>"
  }
}

All trait values must be derived from the character's data. Do NOT use generic defaults. Every generation must be unique.
Output ONLY JSON.`;

// ── Route handler ──

export async function POST(request: NextRequest) {
  try {
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
        { error: `Generation limit reached (${GEN_QUOTA_MAX} per session). Mint your current agent to reset.` },
        { status: 429 },
      );
    }

    // ── Validate env ──
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }
    if (!process.env.SIGNER_PRIVATE_KEY) {
      return NextResponse.json({ error: 'SIGNER_PRIVATE_KEY not configured' }, { status: 500 });
    }

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // ══════════════════════════════════════════════════
    //  STEP 1: Generate agent identity
    // ══════════════════════════════════════════════════

    const agentResponse = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: [{ role: 'user', parts: [{ text: 'Generate a completely random, unique AI agent identity. Surprise me.' }] }],
      config: { systemInstruction: AGENT_SYSTEM_PROMPT, temperature: 1.0 },
    });

    const agentText = agentResponse.text?.trim();
    if (!agentText) throw new Error('No agent response from Gemini');

    let agentJsonStr = agentText;
    if (agentJsonStr.includes('```json')) agentJsonStr = agentJsonStr.split('```json')[1].split('```')[0].trim();
    else if (agentJsonStr.includes('```')) agentJsonStr = agentJsonStr.split('```')[1].split('```')[0].trim();

    const agent = JSON.parse(agentJsonStr);
    if (!agent.name || !agent.description || !agent.creature) throw new Error('Incomplete agent data');

    agent.personality = agent.personality || [];
    agent.boundaries = agent.boundaries || [];
    agent.skills = agent.skills || [];
    agent.domains = agent.domains || [];
    agent.services = [];

    // ══════════════════════════════════════════════════
    //  STEP 2: Generate portrait prompt + visual traits
    // ══════════════════════════════════════════════════

    const agentJson = { name: agent.name, creature: agent.creature, vibe: agent.vibe, personality: agent.personality, skills: agent.skills, domains: agent.domains };
    const portraitUserPrompt = `Write a portrait prompt and generate random visual traits for this character:\n${JSON.stringify(agentJson, null, 2)}`;

    const promptResponse = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: [{ role: 'user', parts: [{ text: portraitUserPrompt }] }],
      config: { systemInstruction: PORTRAIT_SYSTEM_PROMPT, temperature: 0.7 },
    });

    const promptText = promptResponse.text?.trim() || '';
    let portraitPrompt: string;
    let visualTraits: Record<string, string> = {};

    try {
      const cleaned = promptText.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
      const parsed = JSON.parse(cleaned);
      portraitPrompt = parsed.prompt || '';
      visualTraits = parsed.traits || {};
    } catch {
      portraitPrompt = promptText;
    }

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
    //  STEP 3: Generate image
    // ══════════════════════════════════════════════════

    const imageResponse = await ai.models.generateContent({
      model: MODEL_IMAGE,
      contents: [{ role: 'user', parts: [{ text: enrichedPrompt }] }],
      config: {
        responseModalities: ['image', 'text'],
        // @ts-expect-error aspectRatio exists at runtime but missing from SDK types
        aspectRatio: '1:1',
      },
    });

    let base64Image: string | null = null;
    const candidates = imageResponse.candidates;
    if (candidates?.[0]?.content?.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData) {
          const { mimeType, data } = part.inlineData;
          base64Image = `data:${mimeType};base64,${data}`;
          break;
        }
      }
    }
    if (!base64Image) throw new Error('No image generated');

    // ══════════════════════════════════════════════════
    //  STEP 4: Pixelate + encode bitmap
    // ══════════════════════════════════════════════════

    const pixelatedImage = await pixelateImageServer(base64Image);
    const bitmapBytes = await encodeBitmapServer(pixelatedImage);

    // ══════════════════════════════════════════════════
    //  STEP 5: Build traits JSON
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

    // ══════════════════════════════════════════════════
    //  STEP 6: Sign the packet
    // ══════════════════════════════════════════════════

    const imageDataHex = toHex(bitmapBytes);
    const traitsDataHex = toHex(traitsBytes);
    const minterAddress = walletAddress as Hex;
    const deadline = createDeadline(); // 10 minutes (default in signer.ts)
    const chainId = BigInt(process.env.NEXT_PUBLIC_TARGET_CHAIN_ID || '84532'); // Base Sepolia default

    const signature = await signMintPacket(imageDataHex, traitsDataHex, minterAddress, deadline, chainId);

    // ── Increment quota after successful generation ──
    await incrementGenerationCount(walletAddress);

    // ══════════════════════════════════════════════════
    //  STEP 7: Return signed packet to frontend
    // ══════════════════════════════════════════════════

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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate mint data' },
      { status: 500 },
    );
  }
}
