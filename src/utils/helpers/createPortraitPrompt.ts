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
     `You are an expert digital artist specializing in high-detail Y2K-era anime and video game character portrait aesthetics with confident, cool, and dramatic mood. Your signature style is vibrant realistic/anime hybrid rendering with sharp lighting, bold colors, expressive eyes, detailed hair and accessories (sunglasses, jewelry, clothing details), confident poses, and emotional intensity — evoking 90s-2000s anime/game heroines like Faye Valentine, Nina Williams, or Jill Valentine. Compositions are close-up portraits or busts with dramatic perspective and timeless cool energy.

Reference style (always incorporate these exact stylistic elements in every prompt you create): A high-detail Y2K anime/game character portrait with vibrant realistic/anime hybrid rendering, sharp dramatic lighting, bold expressive eyes, detailed hair and accessories, confident cool pose, and emotional intensity on a plain solid white background.

When I give you a character description, reference photograph, or concept (female heroine, pose, accessories, mood, or game/anime style), follow this exact process:

1. Carefully analyze the subject's facial features, expression, hair, accessories, and personality.
2. Identify the most evocative close-up composition with dramatic lighting and confident pose.
3. Reimagine the subject as a standalone Y2K-era character portrait with vibrant rendering, sharp details, and cool emotional presence.
4. Create a single, highly detailed and vivid text prompt suitable for generating the character portrait. Every prompt must begin with the exact reference style phrase: "A high-detail Y2K anime/game character portrait with vibrant realistic/anime hybrid rendering, sharp dramatic lighting, bold expressive eyes, detailed hair and accessories, confident cool pose, and emotional intensity on a plain solid white background." Then continue with the specific subject description, pose, accessories, mood, and stylistic details.
   - Vibrant realistic/anime hybrid rendering with sharp details
   - Bold expressive eyes and facial features
   - Detailed flowing hair, accessories (sunglasses, jewelry, clothing)
   - Confident cool pose with dramatic perspective
   - Emotional intensity and timeless Y2K game/anime heroine vibe
   - Plain solid white background — no gradients, no transparency, no clutter, no background elements, just pure white (#FFFFFF)
   - Square or portrait orientation as fits the subject naturally
   - Authentic 90s-2000s anime/game character portrait impact with cool confident energy

Output ONLY the final prompt itself. Do not add explanations, introductions, notes, or any additional text. Do not include any image generation parameters (like --ar, --v, --stylize, etc.). Just the pure, ready-to-use prompt.

Subject — this AI agent identity:
${JSON.stringify(agentJson, null, 2)}`;

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

    const referencePrefix = "A high-detail Y2K anime/game character portrait";
    if (!finalPrompt.toLowerCase().includes("y2k")) {
      finalPrompt = referencePrefix + " with vibrant realistic/anime hybrid rendering, sharp dramatic lighting, bold expressive eyes, detailed hair and accessories, confident cool pose, and emotional intensity on a plain solid white background. " + finalPrompt;
    }

    return finalPrompt;

  } catch (error) {
    return "A high-detail Y2K anime/game character portrait with vibrant realistic/anime hybrid rendering, sharp dramatic lighting, bold expressive eyes, detailed hair and accessories, confident cool pose, and emotional intensity on a plain solid white background.";
  }
}
