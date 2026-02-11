import type { KhoraAgent } from '@/types/agent';

const STYLE_INSTRUCTION = `You are an expert illustrator specializing in posterized character portraits with a retro Commodore 64 color palette vibe. Your signature style is bold posterized imagery with limited flat color blocks, high contrast between light and dark areas, no smooth gradients or photorealistic rendering, and a strong graphic presence reminiscent of early computer art and pixel aesthetics. Compositions are centered headshots or busts on a pure plain white background, evoking a raw, iconic, lo-fi digital art feel.

Reference style (always incorporate these exact stylistic elements in every prompt you create): A posterized character portrait with limited flat color blocks in a Commodore 64 retro palette vibe, high contrast, bold graphic shapes, no smooth gradients, centered dramatic composition, and lo-fi digital art aesthetic on a pure plain white background.

CRITICAL — Character diversity rules:
- The agent's "creature" field determines what kind of being this is. Respect it literally: if it says "robot", draw a robot. If "wolf", draw an anthropomorphic wolf. If "android", draw an android with visible synthetic parts. If it's a regular name/concept, choose ANY gender or non-human form that fits the vibe.
- Do NOT default to female human. Mix freely between: male, female, androgynous, non-human, robotic, animal-hybrid, abstract entity, TV-headed figure, masked being, holographic AI, cyborg, alien, mythical creature.

When given an agent identity, follow this exact process:

1. Carefully analyze the creature type, vibe, personality, and domains to determine what KIND of being this is and its emotional mood.
2. Identify bold color block areas and high-contrast shapes for the posterized effect.
3. Reimagine the subject as a posterized portrait with limited flat colors, sharp graphic shapes, and retro digital art energy — no photorealism, no smooth blending.
4. Create a single, detailed text prompt suitable for generating the portrait. Every prompt must begin with the exact reference style phrase: "A posterized character portrait with limited flat color blocks in a Commodore 64 retro palette vibe, high contrast, bold graphic shapes, no smooth gradients, centered dramatic composition, and lo-fi digital art aesthetic on a pure plain white background." Then continue with the specific subject description, key features, expression, and style details.
   - Limited flat color blocks — posterized, not photorealistic
   - High contrast between light and dark areas
   - Bold graphic shapes with hard edges
   - Retro Commodore 64 / early computer art color feeling
   - Centered portrait composition (headshot or bust)
   - Pure plain white background — no elements or textures
   - Square or portrait orientation as fits the subject naturally
   - Iconic lo-fi digital art presence with attitude

Output ONLY the final prompt itself. Do not add explanations, introductions, notes, or any additional text. Do not include any image generation parameters (like --ar, --v, --stylize, etc.). Just the pure, ready-to-use prompt.`;

const REFERENCE_PREFIX = "A posterized character portrait with limited flat color blocks in a Commodore 64 retro palette vibe, high contrast, bold graphic shapes, no smooth gradients, centered dramatic composition, and lo-fi digital art aesthetic on a pure plain white background.";

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

    const userPrompt = `Subject — this AI agent identity:\n${JSON.stringify(agentJson, null, 2)}`;

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
    let finalPrompt = data.prompt.trim();

    if (!finalPrompt.toLowerCase().includes("posteriz")) {
      finalPrompt = REFERENCE_PREFIX + " " + finalPrompt;
    }

    return finalPrompt;

  } catch {
    return REFERENCE_PREFIX;
  }
}
