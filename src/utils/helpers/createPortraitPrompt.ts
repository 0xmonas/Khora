import type { KhoraAgent } from '@/types/agent';

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

    const aiPrompt =
     `Analyze this AI agent identity and create a visual image generation prompt that captures their essence as a pixel art NFT portrait.

The prompt MUST:
1. Start with exactly "pixel art style nft pfp, front-facing portrait looking directly at camera, head and shoulders centered, plain white background,"
2. The background MUST be plain white (#FFFFFF) — never dark, never transparent, never colored, never gradient
3. The character MUST be facing forward, looking directly at the viewer (like a passport photo or ID badge)
4. Frame the character consistently: head and upper shoulders visible, centered in frame, same scale every time
5. Use the agent's creature type, vibe, personality, and skills to describe visual features (colors, textures, accessories, expression)
6. Specify pixel art aesthetic: chunky pixels, limited color palette, retro game character feel, clean edges
7. Focus only on visual elements — no text, no logos, no words
8. Be concise but descriptive (max 150 words)

Agent identity:
${JSON.stringify(agentJson, null, 2)}

Return ONLY the prompt, nothing else.`;

    const response = await fetch('/api/generate-prompt', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prompt: aiPrompt }),
    });

    if (!response.ok) {
      throw new Error('Failed to generate prompt');
    }

    const data = await response.json();
    let finalPrompt = data.prompt.trim();

    if (!finalPrompt.toLowerCase().includes("pixel art")) {
      finalPrompt = "pixel art style nft pfp, front-facing portrait looking directly at camera, head and shoulders centered, plain white background, " + finalPrompt;
    }

    return finalPrompt;

  } catch (error) {
    return "pixel art style nft pfp, front-facing portrait looking directly at camera, head and shoulders centered, plain white background";
  }
}
