import type { KhoraAgent } from '@/types/agent';

const STYLE_INSTRUCTION = `Analyze this character JSON and create a visual image generation prompt that captures their essence.

The prompt MUST:
1. Start with exactly "style of nft pfp art, a portrait of"
2. Use the character's creature, traits, vibe, and personality to create a vivid visual description
3. Focus only on visual elements
4. End with "white background"
5. The agent's "creature" field determines what kind of being this is. Respect it literally.
6. Do NOT default to female human. Mix freely between genders and non-human forms.

Return ONLY the prompt, nothing else.`;

const REQUIRED_PREFIX = "style of nft pfp art, a portrait of";

const FALLBACK_PREFIX = `${REQUIRED_PREFIX} a mysterious AI agent character, looking forward with a confident expression, white background`;

/** Ensure prompt always starts with required prefix and includes "white background" */
function enforcePromptRules(prompt: string): string {
  let result = prompt;

  if (!result.toLowerCase().includes("style of nft pfp art")) {
    result = `${REQUIRED_PREFIX} ${result}`;
  }

  if (!result.toLowerCase().includes('white background')) {
    result = result.replace(/\.?\s*$/, ', white background');
  }

  return result;
}

export async function createPortraitPrompt(
  agent: Omit<KhoraAgent, 'image'>
): Promise<string> {
  try {
    const agentJson = {
      name: agent.name,
      creature: agent.creature,
      vibe: agent.vibe,
      personality: agent.personality,
      skills: agent.skills,
      domains: agent.domains,
    };

    const userPrompt = `Analyze this character JSON and create a visual image generation prompt that captures their essence.\n\nCharacter JSON:\n${JSON.stringify(agentJson, null, 2)}\n\nReturn ONLY the prompt, nothing else.`;

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
    const finalPrompt = data.prompt.trim();

    if (!finalPrompt || finalPrompt.length < 10) {
      return FALLBACK_PREFIX;
    }

    return enforcePromptRules(finalPrompt);

  } catch {
    return FALLBACK_PREFIX;
  }
}
