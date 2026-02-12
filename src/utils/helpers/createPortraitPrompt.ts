import type { KhoraAgent } from '@/types/agent';

const STYLE_INSTRUCTION = `You write short, fun, colorful portrait prompts for AI image generation AND generate random visual traits for the character.

Style: Flat illustration, close-up portrait, GTA6 color style, tilting head slightly upward, light falling dramatically from above. Fun, vivid, sci-fi flavored faces with attitude and personality. NOT 3D, NOT photorealistic — flat 2D illustration with bold shapes and clean lines. PLAIN WHITE BACKGROUND — no scenery, no gradient, no patterns, just solid white (#FFFFFF) behind the character.

CRITICAL — Gender & appearance:
- You MUST always specify a gender/form. NEVER leave it vague like "a figure" or "a being".
- Pick ONE randomly each time: young man, old man, woman, elderly woman, androgynous person, cyborg with human face, alien humanoid, masked figure, scarred warrior, hooded monk, android with synthetic skin, animal-headed humanoid, glitched holographic face.
- The "creature" field is a HINT for flavor, not a literal instruction. A "phoenix" becomes e.g. "a woman with ember-bright eyes and flame-streaked hair", NOT a literal bird. A "wolf" becomes "a grizzled man with sharp lupine features", NOT a wolf drawing.
- Only go fully non-human if creature is explicitly robotic/android/AI — and even then give it a face with character and personality.
- Do NOT default to the same gender repeatedly. Randomize genuinely.

CRITICAL — Shoulders:
- The portrait MUST show shoulders. Frame from shoulders up — face AND shoulders clearly visible.
- Shoulders can have armor, jacket, hoodie, bare skin, tattoos, straps, cables, fur collar, etc.
- NEVER crop at the neck. The image must include the upper chest/shoulder area.

CRITICAL — Background:
- Background MUST be plain white. No scenery, no gradient, no objects behind the character.
- Always include "white background" in the prompt.

Rules:
- Use the character's skills and domains to add subtle visual flavor to the FACE (e.g. a DeFi agent might have calculating sharp eyes; a creative agent might have paint-stained skin or ink markings; a gaming agent might have a HUD reflection in the eyes).
- Don't go overboard. Subtle sci-fi details, not cluttered.
- Always start the prompt with "Flat illustration, close-up portrait of"

OUTPUT FORMAT — You MUST respond with valid JSON only, no markdown, no explanation:
{
  "prompt": "Flat illustration, close-up portrait of ...",
  "traits": {
    "Hair": "<your creative choice>",
    "Eyes": "<your creative choice>",
    "Facial Hair": "<your creative choice or None>",
    "Mouth": "<your creative choice>",
    "Accessory": "<your creative choice or None>",
    "Headwear": "<your creative choice or None>",
    "Skin": "<your creative choice>"
  }
}

Trait rules:
- Hair: describe style + color. Vary wildly every time. Do NOT repeat or default to any style.
- Eyes: color or special feature. Be creative and unique.
- Facial Hair: beard/mustache style or "None". Surprise me.
- Mouth: expression. Make it interesting.
- Accessory: something on face/neck or "None". Be inventive.
- Headwear: hat/hood/visor or "None". Go wild.
- Skin: skin tone or texture. Be diverse.
- NEVER copy from previous outputs. Every generation must be completely unique and surprising.`;

const FALLBACK_PROMPT = "Flat illustration, close-up portrait of a mysterious figure with sharp features and broad shoulders, head tilted slightly upward, dramatic overhead light, white background, GTA6 color style.";

const FALLBACK_TRAITS = {
  Hair: 'short dark hair',
  Eyes: 'brown',
  'Facial Hair': 'None',
  Mouth: 'neutral',
  Accessory: 'None',
  Headwear: 'None',
  Skin: 'warm brown',
};

export interface VisualTraits {
  Hair: string;
  Eyes: string;
  'Facial Hair': string;
  Mouth: string;
  Accessory: string;
  Headwear: string;
  Skin: string;
}

export interface PortraitResult {
  prompt: string;
  traits: VisualTraits;
}

export async function createPortraitPrompt(
  agent: Omit<KhoraAgent, 'image'>
): Promise<PortraitResult> {
  try {
    const agentJson = {
      name: agent.name,
      creature: agent.creature,
      vibe: agent.vibe,
      personality: agent.personality,
      skills: agent.skills,
      domains: agent.domains,
    };

    const userPrompt = `Write a portrait prompt and generate random visual traits for this character:\n${JSON.stringify(agentJson, null, 2)}`;

    const response = await fetch('/api/generate-prompt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: userPrompt,
        systemInstruction: STYLE_INSTRUCTION,
      }),
    });

    if (!response.ok) {
      throw new Error('Failed to generate prompt');
    }

    const data = await response.json();
    const raw = data.prompt.trim();

    // Parse JSON response from AI
    let parsed: { prompt?: string; traits?: Record<string, string> };
    try {
      // Strip markdown code fences if present
      const cleaned = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '');
      parsed = JSON.parse(cleaned);
    } catch {
      // AI didn't return valid JSON — use raw as prompt, fallback traits
      let finalPrompt = raw;
      if (!finalPrompt.toLowerCase().startsWith("flat illustration")) {
        finalPrompt = "Flat illustration, close-up portrait of " + finalPrompt;
      }
      return { prompt: finalPrompt, traits: { ...FALLBACK_TRAITS } };
    }

    let finalPrompt = parsed.prompt || raw;
    if (!finalPrompt || finalPrompt.length < 10) {
      finalPrompt = FALLBACK_PROMPT;
    }
    if (!finalPrompt.toLowerCase().startsWith("flat illustration")) {
      finalPrompt = "Flat illustration, close-up portrait of " + finalPrompt;
    }

    const traits: VisualTraits = {
      Hair: parsed.traits?.Hair || FALLBACK_TRAITS.Hair,
      Eyes: parsed.traits?.Eyes || FALLBACK_TRAITS.Eyes,
      'Facial Hair': parsed.traits?.['Facial Hair'] || FALLBACK_TRAITS['Facial Hair'],
      Mouth: parsed.traits?.Mouth || FALLBACK_TRAITS.Mouth,
      Accessory: parsed.traits?.Accessory || FALLBACK_TRAITS.Accessory,
      Headwear: parsed.traits?.Headwear || FALLBACK_TRAITS.Headwear,
      Skin: parsed.traits?.Skin || FALLBACK_TRAITS.Skin,
    };

    return { prompt: finalPrompt, traits };

  } catch {
    return { prompt: FALLBACK_PROMPT, traits: { ...FALLBACK_TRAITS } };
  }
}

// ── Previous styles — disabled ──
// Posterized C64: REFERENCE_PREFIX = "A posterized character portrait with limited flat color blocks..."
// Replicate khora LoRA: REQUIRED_PREFIX = "style of nft pfp art, a portrait of"
// Black & white cinematic: "Close-up black and white portrait of..."
