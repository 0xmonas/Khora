import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { toHex } from 'viem';
import type { Hex } from 'viem';
import { generationLimiter, getIP, rateLimitHeaders, checkGenerationQuota, incrementGenerationCount, GEN_QUOTA_MAX } from '@/lib/ratelimit';
import { signMintPacket, createDeadline } from '@/lib/server/signer';
import { encodeBitmapServer, pixelateImageServer } from '@/lib/server/bitmap';

export const maxDuration = 120; // AI pipeline can take ~60s

const MODEL_TEXT = 'gemini-3-flash-preview';
const MODEL_IMAGE = 'imagen-4.0-fast-generate-001';

// ── Agent generation system prompt ──

const AGENT_SYSTEM_PROMPT = `You are an AI agent identity designer. You generate completely unique, creative agent identities from scratch — no user input needed. Every agent must be wildly different from the last.
Return ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "name": "string (creative, memorable agent name — can be abstract, sci-fi, mythological, playful, or edgy)",
  "description": "string (1-2 sentences describing what this agent does and its personality)",
  "creature": "string (what kind of entity: AI familiar, digital ghost, neural construct, void walker, data wraith, etc.)",
  "vibe": "string (communication style: sharp and witty, calm and methodical, chaotic and creative, etc.)",
  "emoji": "string (single emoji that represents this agent)",
  "personality": ["string array of 4-6 core behavior principles"],
  "boundaries": ["string array of 3-5 things this agent refuses to do"],
  "skills": ["string array of 4-8 capabilities"],
  "domains": ["string array of 3-6 areas of expertise"],
  "services": []
}
Be wildly creative. Every agent should feel completely unique — vary the creature type, vibe, skills, domains, and personality drastically each time. Mix genres: cyberpunk, fantasy, noir, cosmic horror, solarpunk, etc.`;

// ── Portrait prompt system instruction ──

const PORTRAIT_SYSTEM_PROMPT = `You are an expert fashion photographer specializing in avant-garde high-fashion editorial portraits with surreal, dramatic, and rebellious mood. Your signature style is high-contrast dramatic lighting, bold vibrant colors, intense expressions, exaggerated accessories and makeup, surreal elements, and emotional intensity — capturing confident, edgy, and powerful personalities in close-up compositions on solid or subtle backgrounds.

Reference style (always incorporate these exact stylistic elements in every prompt you create): A high-contrast dramatic avant-garde fashion portrait with bold vibrant colors, intense expression, exaggerated accessories or makeup, surreal rebellious elements, powerful emotional intensity, and solid or subtle background.

When given a character, follow this exact process:
1. Carefully analyze the character's personality, expression, and potential for dramatic enhancement from their name, creature, vibe, personality, skills and domains.
2. Identify the most evocative pose, lighting, accessories, and surreal touch.
3. Reimagine the character as a standalone high-fashion editorial portrait with bold colors, intense mood, and avant-garde edge.
4. Create a single, highly detailed and vivid text prompt. Every prompt MUST begin with the exact reference style phrase: "A high-contrast dramatic avant-garde fashion portrait with bold vibrant colors, intense expression, exaggerated accessories or makeup, surreal rebellious elements, powerful emotional intensity, and solid or subtle background." Then continue with the specific subject description, pose, accessories, lighting, and mood details.
   - High-contrast dramatic lighting with bold shadows and highlights
   - Bold vibrant colors, exaggerated makeup or hair
   - Intense confident/rebellious expression
   - Exaggerated accessories (crowns, masks, chains, sunglasses)
   - Surreal or edgy elements for emotional impact
   - Close-up portrait composition
   - Solid or subtle background
   - Square or portrait orientation as fits the subject naturally
   - Powerful avant-garde fashion editorial impact with rebellious energy

CRITICAL — Character:
- Interpret the character's name, creature, vibe, personality, skills and domains freely. Use ALL of these fields to decide what kind of being to draw — human, alien, cyborg, animal-headed, masked, whatever fits.
- Be creative and surprising. Don't default to the same type repeatedly.
- You MUST always be specific about what you're drawing. NEVER leave it vague like "a figure" or "a being".
- Use the character's skills and domains to add subtle visual flavor.

CRITICAL — Shoulders:
- The portrait MUST show shoulders. Frame from shoulders up — face AND shoulders clearly visible.
- NEVER crop at the neck. The image must include the upper chest/shoulder area.

CRITICAL — Background:
- The background MUST be a single solid color chosen randomly from ONLY these four options: black, cyan, yellow, red.
- The background must be a clean, solid flat fill — no scenery, no gradient, no patterns.

OUTPUT FORMAT — You MUST respond with valid JSON only:
{
  "prompt": "A high-contrast dramatic avant-garde fashion portrait...",
  "traits": {
    "Hair": "<creative choice>",
    "Eyes": "<creative choice>",
    "Facial Hair": "<creative choice or None>",
    "Mouth": "<creative choice>",
    "Accessory": "<creative choice or None>",
    "Headwear": "<creative choice or None>",
    "Skin": "<creative choice>"
  }
}

Output ONLY the final JSON. Do not add explanations or additional text.`;

const REFERENCE_PREFIX = 'a high-contrast dramatic avant-garde fashion portrait';

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
      portraitPrompt = `A high-contrast dramatic avant-garde fashion portrait with bold vibrant colors, intense expression, exaggerated accessories or makeup, surreal rebellious elements, powerful emotional intensity, and solid or subtle background. A ${agent.creature} named ${agent.name} with ${agent.vibe} energy.`;
    }
    if (!portraitPrompt.toLowerCase().startsWith(REFERENCE_PREFIX)) {
      portraitPrompt = 'A high-contrast dramatic avant-garde fashion portrait with bold vibrant colors, intense expression, exaggerated accessories or makeup, surreal rebellious elements, powerful emotional intensity, and solid or subtle background. ' + portraitPrompt;
    }

    // Enrich with trait details
    const traitLines = Object.entries(visualTraits)
      .filter(([, v]) => v && v !== 'None' && v !== 'none')
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    const enrichedPrompt = traitLines ? `${portraitPrompt} Character details: ${traitLines}.` : portraitPrompt;

    // ══════════════════════════════════════════════════
    //  STEP 3: Generate image
    // ══════════════════════════════════════════════════

    const imageResponse = await ai.models.generateImages({
      model: MODEL_IMAGE,
      prompt: enrichedPrompt,
      config: {
        numberOfImages: 1,
        aspectRatio: '1:1',
      },
    });

    let base64Image: string | null = null;
    const generated = imageResponse.generatedImages;
    if (generated?.[0]?.image?.imageBytes) {
      base64Image = `data:image/png;base64,${generated[0].image.imageBytes}`;
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
