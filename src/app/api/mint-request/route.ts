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
  "creature": "string (what kind of entity — MUST vary wildly: human woman, human man, cyborg child, robotic cat, alien jellyfish, crystalline bird, neon fox, plasma dragon, sentient flower, mechanical octopus, holographic deer, cosmic whale, fungal golem, etc.)",
  "vibe": "string (communication style: sharp and witty, calm and methodical, chaotic and creative, warm and nurturing, playful and silly, mysterious and poetic, etc.)",
  "emoji": "string (single emoji that represents this agent)",
  "personality": ["string array of 4-6 core behavior principles"],
  "boundaries": ["string array of 3-5 things this agent refuses to do"],
  "skills": ["string array of 4-8 capabilities"],
  "domains": ["string array of 3-6 areas of expertise"],
  "services": []
}
CRITICAL DIVERSITY RULES:
- Creature type MUST rotate between: humans (all genders/ages/ethnicities), animals, aliens, robots, mythological beings, plants, abstract entities. NEVER repeat the same category twice in a row.
- Do NOT default to dark/gothic/void/wraith/shadow themes. Vary between: cute, fierce, elegant, goofy, serene, punk, regal, primal, cosmic, organic, mechanical, ethereal.
- Mix genres wildly: solarpunk, cottagecore, afrofuturism, vaporwave, art deco, tribal, kawaii, brutalist, baroque, cyberpunk, fantasy, etc.`;

// ── Portrait prompt system instruction ──

const PORTRAIT_SYSTEM_PROMPT = `You are an avant-garde fashion portrait photographer. You create high-contrast dramatic editorial portraits with bold vibrant colors, surreal elements, and solid color backgrounds.

Given a character's data (name, creature, vibe, personality, skills, domains), write a detailed image prompt for a portrait that authentically represents that character.

STYLE:
- High-contrast dramatic lighting, bold SATURATED vibrant colors, exaggerated makeup or accessories
- Shoulders-up composition — face AND shoulders clearly visible, NEVER crop at neck
- Avant-garde fashion editorial energy
- The character's COLOR PALETTE must be BRIGHT, VIVID, and SATURATED — think fashion magazine covers, pop art, Warhol prints

ABSOLUTELY FORBIDDEN — never include any of these:
- Dark/black/charred/scorched/obsidian skin tones or textures
- Glass reflections, liquid chrome, melting/dripping effects
- Overall dark or moody color palettes — NO all-black, all-grey, all-brown characters
- Glowing cracks/fissures/veins on dark surfaces
- "Void", "shadow", "ash", "smoke", "charred" aesthetics
- Monochrome dark portraits

REQUIRED COLOR APPROACH:
- Every character must have at LEAST 2-3 vivid colors on their face/body (not just accessories)
- Skin/surface can be: pastel pink, electric blue, golden, coral, lavender, mint green, warm copper, pearl white, tangerine, magenta, turquoise, candy red — ALWAYS bright and saturated
- Metallic finishes (gold, silver, rose gold, copper) ARE allowed — but must be SHINY and bright, not dark
- Even "dark" themed characters must be rendered in bright vivid colors — a shadow creature should be electric purple and neon blue, NOT black and grey

CHARACTER INTERPRETATION:
- Derive EVERYTHING from the character data. The name, creature type, vibe, personality, skills, and domains should drive every visual decision.
- The character's mood and expression must match their personality and vibe — a playful trickster should look mischievous, a stoic guardian should look calm and steady, a chaotic entity should look wild. Do NOT default to angry/intense for every character.
- Be specific about what you're drawing. NEVER say "a figure" or "a being" — describe the actual creature/entity.
- Vary wildly between characters. Different creature types, body features, colors, accessories, expressions.
- Characters can be: human (any gender, age, ethnicity), animal, alien, robot, mythological being, hybrid, etc.

BACKGROUND:
- Do NOT mention any background color in your prompt. The background will be added separately.
- Do NOT let any background color influence the character's appearance.

OUTPUT FORMAT — Respond with valid JSON only, no markdown:
{
  "prompt": "<your portrait prompt here>",
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
      portraitPrompt = `High-contrast dramatic portrait of a ${agent.creature} named ${agent.name} with ${agent.vibe} energy, bold vibrant colors.`;
    }

    // Strip any background mentions the AI may have added
    portraitPrompt = portraitPrompt.replace(/\b(solid|flat|plain|pure)?\s*(black|red|yellow|green|white|grey|gray|blue|navy|dark)\s*background\b/gi, '').trim();

    // Enrich with trait details
    const traitLines = Object.entries(visualTraits)
      .filter(([, v]) => v && v !== 'None' && v !== 'none')
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    let enrichedPrompt = traitLines ? `${portraitPrompt} Character details: ${traitLines}.` : portraitPrompt;

    // Append background color — chosen server-side so AI never sees it during character design
    const bgColors = ['black', 'red', 'yellow', 'green'];
    const bg = bgColors[Math.floor(Math.random() * bgColors.length)];
    enrichedPrompt += ` Solid ${bg} background, no gradient, no scenery.`;

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
