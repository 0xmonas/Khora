import { NextRequest, NextResponse } from 'next/server';
import { toHex } from 'viem';
import type { Hex } from 'viem';
import { GoogleGenAI } from '@google/genai';
import Replicate from 'replicate';
import { generationLimiter, getIP, rateLimitHeaders, checkGenerationQuota, GEN_QUOTA_MAX, checkDailyCap } from '@/lib/ratelimit';
import { signMintPacket, createDeadline } from '@/lib/server/signer';
import { encodeBitmapServer, pixelateImageServer } from '@/lib/server/bitmap';
import { ALL_OASF_SKILLS, ALL_OASF_DOMAINS } from '@/lib/oasf-taxonomy';
import { EYEWEAR_POOL, HEADWEAR_POOL, OUTFIT_POOL, CREATURE_POOL, samplePool } from '@/lib/trait-pools';

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

const FLUX_LORA_MODEL = process.env.REPLICATE_FLUX_MODEL || '0xmonas/y2:418c546e6143c2f46c6e774a625472e6ae71e78bac4d5cadede1ce3d31d3700d';

export const maxDuration = 300; // AI pipeline: Gemini + Replicate + encoding (~30-60s typical)

const MODEL_TEXT = process.env.GEMINI_TEXT_MODEL || 'gemini-3.1-flash-lite-preview';

// Fixed reference prefix — every image prompt MUST start with this exact phrase
const PORTRAIT_REFERENCE_PREFIX = 'A clean retro digital illustration portrait in PC-98 and C64 aesthetic, featuring flat color blocks with bold clean outlines, limited color palette with 2-5 dominant saturated colors, hard-edged cel-shading with no smooth gradients, front-facing shoulders-up composition looking directly at the viewer with face and upper body clearly visible, clean crisp linework, no glitch effects, no distortion, no noise artifacts';

// ── Combined system prompt: agent identity + portrait prompt + visual traits in ONE call ──

interface PreRolledTraits {
  creature: string;
  outfit: string;
  eyewear: string;
  headwear: string;
  memeCore: number;
  traitIntensity: number;
}

function preRollTraits(): PreRolledTraits {
  return {
    creature: samplePool(CREATURE_POOL, 1)[0] as string,
    outfit: samplePool(OUTFIT_POOL, 1)[0] as string,
    eyewear: samplePool(EYEWEAR_POOL, 1)[0] as string, // can be None
    headwear: samplePool(HEADWEAR_POOL, 1)[0] as string, // can be None
    memeCore: Math.floor(Math.random() * 101),
    traitIntensity: Math.floor(Math.random() * 101),
  };
}

function buildCombinedSystemPrompt(userSkills?: string[], userDomains?: string[], rolled?: PreRolledTraits): string {
  const skillsList = Array.from(ALL_OASF_SKILLS).join(', ');
  const domainsList = Array.from(ALL_OASF_DOMAINS).join(', ');
  const r = rolled ?? preRollTraits();

  return `You are a character designer for BOOA — Born On-chain Autonomous Agents — set in the Khôra universe.

KHÔRA UNIVERSE:
Khôra is a sprawling cyberpunk megacity where autonomous agents are the backbone of society. Every service, every hustle, every operation runs through agents. They fix things, break things, trade things, guard things, heal things, hack things, build things. Some work in gleaming corporate towers, others in neon-lit underground markets. Some are respected professionals, others are outlaws.

3333 BOOAs are the agents of Khôra. Each one has a role, a specialty, a reputation, and a look. They range from street-level hustlers to elite operatives, from junkyard mechanics to nightclub owners, from unlicensed surgeons to rogue diplomats.

THE VIBE IS PUNK. Not clean, not corporate, not generic. Every BOOA has CHARACTER — scars, attitude, style, edge. Even the "respectable" ones have something off about them. Khôra leaves marks on everyone.

Every BOOA is different — different species, different job, different district, different story. A BOOA can be human, animal, robot, demon, hybrid, mutant, or something that defies classification. The only rule: they must feel like someone who LIVES in Khôra.

${userSkills !== undefined || userDomains !== undefined ? `
The user has configured their ERC-8004 parameters. You MUST respect their choices EXACTLY:
${userSkills !== undefined ? (userSkills.length > 0
  ? `SKILLS (use EXACTLY these, do NOT add others): ${userSkills.join(', ')}`
  : `SKILLS: The user chose NONE — output an EMPTY skills array []`) : `OASF SKILLS (pick 4-8, EXACT label text only):\n${skillsList}`}

${userDomains !== undefined ? (userDomains.length > 0
  ? `DOMAINS (use EXACTLY these, do NOT add others): ${userDomains.join(', ')}`
  : `DOMAINS: The user chose NONE — output an EMPTY domains array []`) : `OASF DOMAINS (pick 3-6, EXACT label text only):\n${domainsList}`}

CRITICAL: Do NOT add, remove, or substitute any skills or domains. Output ONLY what is specified above.
` : `STEP 1: Pick skills and domains FIRST from the OASF lists below.
STEP 2: Build the entire agent identity and portrait around those choices.

OASF SKILLS (pick 4-8, EXACT label text only):
${skillsList}

OASF DOMAINS (pick 3-6, EXACT label text only):
${domainsList}`}

PRE-ROLLED TRAITS — the system has ALREADY decided these for this character. You MUST use them:
- CREATURE TYPE: "${r.creature}" — build your character around this. Adapt it to fit Khôra but keep the core concept.
- OUTFIT: "${r.outfit}" — this is what they're wearing. Add specific colors and details. Describe it vividly in the portraitPrompt.
- EYEWEAR: "${r.eyewear}" — ${r.eyewear === 'None' ? 'no eyewear for this character.' : 'they wear this. Describe it with color in the portraitPrompt.'}
- HEADWEAR: "${r.headwear}" — ${r.headwear === 'None' ? 'no headwear for this character.' : 'they wear this. Describe it with color in the portraitPrompt.'}
- MEME CORE: ${r.memeCore}/100 — ${r.memeCore < 30 ? 'dead serious operative' : r.memeCore < 70 ? 'sharp-tongued with humor' : 'unhinged wildcard'}
- TRAIT INTENSITY: ${r.traitIntensity}/100 — ${r.traitIntensity < 30 ? 'clean and minimal' : r.traitIntensity < 70 ? 'distinctive details' : 'maxed-out accessories and wild features'}

Your job: take these pre-rolled traits and build a COHERENT character around them. Invent the name, personality, backstory, hair, eyes, skin, facial features — but the creature type, outfit, eyewear, and headwear are LOCKED.

Return ONLY valid JSON (no markdown, no explanation):
{
  "skills": ["4-8 from OASF skills list above"],
  "domains": ["3-6 from OASF domains list above"],
  "name": "string — a handle, callsign, or street name that fits",
  "description": "string — 1-2 sentences, what this BOOA does in Khôra",
  "creature": "string — MUST be based on: ${r.creature}. Adapt to Khôra but keep the core.",
  "vibe": "string — how they talk",
  "emoji": "string — single emoji",
  "personality": ["4-6 traits reflecting skills + Khôra life"],
  "boundaries": ["3-5 things this BOOA refuses"],
  "services": [],
  "memeCore": ${r.memeCore},
  "traitIntensity": ${r.traitIntensity},
  "portraitPrompt": "string — MUST start with: '${PORTRAIT_REFERENCE_PREFIX}', then describe THIS specific character with ALL their visual traits. MUST mention the outfit, eyewear, headwear with specific colors. Every visible item needs a color name.",
  "visualTraits": {
    "Hair": "string — invent a hairstyle WITH color that fits this creature",
    "Eyes": "string — describe the eyes",
    "Mouth": "string — expression or mouth accessory",
    "Facial Feature": "string — scars, tattoos, piercings, etc. or None",
    "Eyewear": "${r.eyewear}",
    "Headwear": "${r.headwear}",
    "Outfit": "string — MUST be based on: ${r.outfit}. Add specific colors.",
    "Skin": "string — any color that fits: vivid fantasy OR natural. Be specific. NEVER dull gray or plain black."
  }
}

RULES:
- The pre-rolled creature, outfit, eyewear, headwear are NON-NEGOTIABLE. Use them.
- skills and domains MUST be exact matches from the OASF lists. Do not invent new ones.
- personality and boundaries must feel like THIS specific character, not generic AI platitudes.
- portraitPrompt MUST explicitly describe the outfit WITH colors, the eyewear, the headwear, the hair, the skin color. If you don't name colors, the image will be gray.
- Retro digital illustration style — flat color blocks, bold outlines, hard-edged cel-shading. NOT photorealistic.
- Front-facing, shoulders-up, looking directly at viewer. NEVER side profile.
- Do NOT use "pixel", "pixel art", or "pixelated" in portraitPrompt.
- Do NOT mention any background in portraitPrompt.
- Bold, saturated colors — neons, pastels, vivid primaries. Even dark characters need vivid accents.

Output ONLY the JSON object.`;
}

// ── Route handler ──

export async function POST(request: NextRequest) {
  try {
    // ── IP rate limit first (cheap, no counter burn) ──
    const ip = getIP(request);
    const rl = await generationLimiter.limit(ip);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many requests — please wait before generating again' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    // ── Wallet auth (cheap, no counter burn) ──
    const walletAddress = request.headers.get('x-siwe-address');
    if (!walletAddress) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    // ── Global daily cap (atomic INCR — only after cheap checks pass) ──
    const daily = await checkDailyCap();
    if (!daily.allowed) {
      return NextResponse.json(
        { error: 'Daily generation limit reached. Please try again tomorrow.' },
        { status: 503 },
      );
    }

    // ── Per-wallet generation quota (atomic INCR) ──
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

    // ── Parse user-selected skills/domains from request body ──
    // If body contains skills/domains arrays, user has configured 8004 params:
    //   - non-empty array = use exactly these
    //   - empty array = user chose none, AI must NOT generate any
    //   - key absent = fully random (AI picks)
    let userSkills: string[] | undefined;
    let userDomains: string[] | undefined;
    let userConfigured = false;
    try {
      const body = await request.json();
      if (Array.isArray(body.skills)) {
        userConfigured = true;
        userSkills = body.skills.filter((s: unknown) => typeof s === 'string' && ALL_OASF_SKILLS.has(s as string)) as string[];
      }
      if (Array.isArray(body.domains)) {
        userConfigured = true;
        userDomains = body.domains.filter((d: unknown) => typeof d === 'string' && ALL_OASF_DOMAINS.has(d as string)) as string[];
      }
    } catch { /* empty body is fine */ }

    // ══════════════════════════════════════════════════
    //  STEP 1: Generate agent identity + portrait prompt + visual traits (SINGLE CALL)
    // ══════════════════════════════════════════════════

    const userPrompt = userConfigured
      ? `Generate a unique AI agent identity with its portrait prompt and visual traits. The user has pre-selected their skills/domains — use ONLY what they chose, do NOT add any others.`
      : 'Generate a completely random, unique AI agent identity with its portrait prompt and visual traits. Surprise me.';

    const combinedResponse = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      config: { systemInstruction: buildCombinedSystemPrompt(userSkills, userDomains), temperature: 1.0 },
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
      // User selections take priority; otherwise validate AI output against OASF taxonomy
      skills: userSkills ?? (parsed.skills || []).filter((s: string) => ALL_OASF_SKILLS.has(s)),
      domains: userDomains ?? (parsed.domains || []).filter((d: string) => ALL_OASF_DOMAINS.has(d)),
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

    // Build trait description — each trait becomes a concrete visual instruction
    const traitParts: string[] = [];
    if (visualTraits.Skin && visualTraits.Skin !== 'None') traitParts.push(`${visualTraits.Skin} skin`);
    if (visualTraits.Hair && visualTraits.Hair !== 'None') traitParts.push(`${visualTraits.Hair} hair`);
    if (visualTraits.Eyes && visualTraits.Eyes !== 'None') traitParts.push(`${visualTraits.Eyes} eyes`);
    if (visualTraits.Mouth && visualTraits.Mouth !== 'None') traitParts.push(visualTraits.Mouth);
    if (visualTraits['Facial Feature'] && visualTraits['Facial Feature'] !== 'None') traitParts.push(visualTraits['Facial Feature']);
    if (visualTraits.Eyewear && visualTraits.Eyewear !== 'None') traitParts.push(`wearing ${visualTraits.Eyewear}`);
    if (visualTraits.Headwear && visualTraits.Headwear !== 'None') traitParts.push(`wearing ${visualTraits.Headwear}`);
    if (visualTraits.Outfit && visualTraits.Outfit !== 'None') traitParts.push(`dressed in ${visualTraits.Outfit}`);

    // Insert traits RIGHT AFTER the reference prefix, before any AI-generated description
    // This ensures FLUX sees them early in the prompt where they have the most weight
    const traitBlock = traitParts.length > 0 ? `, ${traitParts.join(', ')}` : '';

    // Find where the reference prefix ends and inject traits there
    let enrichedPrompt: string;
    if (portraitPrompt.includes(PORTRAIT_REFERENCE_PREFIX)) {
      enrichedPrompt = portraitPrompt.replace(
        PORTRAIT_REFERENCE_PREFIX,
        `${PORTRAIT_REFERENCE_PREFIX}${traitBlock}`
      );
    } else {
      enrichedPrompt = `${PORTRAIT_REFERENCE_PREFIX}${traitBlock}. ${portraitPrompt}`;
    }

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
    const maxAttempts = 8;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const imageResp = await fetch(imageUrl);
        if (!imageResp.ok) throw new Error(`HTTP ${imageResp.status}`);
        imageBuffer = Buffer.from(await imageResp.arrayBuffer());
        break;
      } catch (dlErr) {
        if (attempt === maxAttempts - 1) throw new Error(`Failed to download generated image after ${maxAttempts} attempts`);
        const delay = (attempt + 1) * 2000 + 1000; // 3s, 5s, 7s, 9s, 11s, 13s, 15s
        console.warn(`[mint] Image download attempt ${attempt + 1} failed, retrying in ${delay / 1000}s...`, dlErr);
        await new Promise(r => setTimeout(r, delay));
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
    // Randomization dials (0-100)
    const memeCore = Math.max(0, Math.min(100, Math.round(Number(parsed.memeCore) || 0)));
    const traitIntensity = Math.max(0, Math.min(100, Math.round(Number(parsed.traitIntensity) || 0)));
    attributes.push({ trait_type: 'Meme Core', value: memeCore.toString() });
    attributes.push({ trait_type: 'Trait Intensity', value: traitIntensity.toString() });
    attributes.push({ trait_type: 'Palette', value: 'C64' });

    const traitsJSON = JSON.stringify(attributes);
    const traitsBytes = new TextEncoder().encode(traitsJSON);

    const imageDataHex = toHex(bitmapBytes);
    const traitsDataHex = toHex(traitsBytes);
    const minterAddress = walletAddress as Hex;
    const deadline = createDeadline(); // 10 minutes (default in signer.ts)
    const chainId = BigInt(process.env.NEXT_PUBLIC_TARGET_CHAIN_ID || '11011'); // Shape Sepolia default

    const signature = await signMintPacket(imageDataHex, traitsDataHex, minterAddress, deadline, chainId);


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
    const raw = error instanceof Error ? error.message : '';
    // Return user-friendly messages without leaking internal details
    let message = 'Failed to generate mint data. Please try again.';
    if (raw.includes('timed out') || raw.includes('aborted')) message = 'Image generation timed out. Please try again.';
    else if (raw.includes('No response from Gemini')) message = 'AI generation failed. Please try again.';
    else if (raw.includes('Incomplete agent data')) message = 'AI produced incomplete data. Please try again.';
    else if (raw.includes('No image generated')) message = 'Image generation failed. Please try again.';
    else if (raw.includes('Failed to download')) message = 'Image download failed. Please try again.';
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}
