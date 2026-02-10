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
     `You are an expert illustrator specializing in high-contrast black and white stencil portrait aesthetics with bold dramatic posterization. Your signature style is extreme binary contrast with solid black fills for shadows and hair, pure white highlights for skin and light areas, rough jagged hand-cut stencil edges, subtle texture in black areas for depth, no gray shading or gradients, and strong symbolic portrait presence with emotional intensity. Compositions are centered headshots or busts on pure plain white background, evoking raw, powerful, and timeless stencil art feel.

Reference style (always incorporate these exact stylistic elements in every prompt you create): A high-contrast black and white stencil portrait with extreme binary posterization, solid black fills and rough jagged edges, pure white highlights, subtle texture in black areas, centered dramatic composition, and raw powerful stencil aesthetic on pure plain white background.

When I give you a subject (person, face description, celebrity, character, or portrait concept), follow this exact process:

1. Carefully analyze the subject's facial features, expression, hair, and emotional mood.
2. Identify the essential bold shadow areas and highlight shapes for stencil effect.
3. Reimagine the subject as a high-contrast stencil portrait with solid black fills, jagged edges, and dramatic binary contrast — capturing intensity without any gray or smooth blending.
4. Create a single, highly detailed and vivid text prompt suitable for generating the stencil portrait. Every prompt must begin with the exact reference style phrase: "A high-contrast black and white stencil portrait with extreme binary posterization, solid black fills and rough jagged edges, pure white highlights, subtle texture in black areas, centered dramatic composition, and raw powerful stencil aesthetic on pure plain white background." Then continue with the specific subject description, key features, expression, and stencil execution details.
   - Extreme binary contrast: solid black fills vs pure white — no grays or gradients
   - Rough jagged hand-cut stencil edges for raw authenticity
   - Subtle texture/noise in black areas only for depth
   - Bold dramatic lighting and shadow shapes
   - Centered portrait composition (headshot or bust)
   - Pure plain white background — no elements or textures
   - Square or portrait orientation as fits the subject naturally
   - Raw powerful stencil portrait impact with emotional symbolic intensity

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

    const referencePrefix = "A high-contrast black and white stencil portrait";
    if (!finalPrompt.toLowerCase().includes("stencil portrait")) {
      finalPrompt = referencePrefix + " with extreme binary posterization, solid black fills and rough jagged edges, pure white highlights, subtle texture in black areas, centered dramatic composition, and raw powerful stencil aesthetic on pure plain white background. " + finalPrompt;
    }

    return finalPrompt;

  } catch (error) {
    return "A high-contrast black and white stencil portrait with extreme binary posterization, solid black fills and rough jagged edges, pure white highlights, subtle texture in black areas, centered dramatic composition, and raw powerful stencil aesthetic on pure plain white background.";
  }
}
