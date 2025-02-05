import { CharacterTemplate } from '@/types/templates';

export async function createPortraitPrompt(
  character: CharacterTemplate,
  selectedModel: 'KHORA' | 'ZEREBRO' | 'BAYC' = 'KHORA'
): Promise<string> {
  try {
    let characterJson;
    if (character.type === 'eliza' || character.type === 'fleek') {
      characterJson = {
        name: character.name,
        personality: character.bio,
        traits: character.adjectives,
        interests: character.topics,
        background: character.lore
      };
    } else {
      characterJson = {
        name: character.name,
        personality: character.bio.join('\n'),
        traits: character.traits,
        examples: character.examples
      };
    }

    const aiPrompt =
     `Analyze this character JSON and create a visual image generation prompt that captures their essence.
     The prompt MUST:
     1. Start with exactly "style of nft pfp art without backgroud, a portrait of"
     2. Use the character's entity, traits, interests, and background to create a vivid visual description
     3. Focus only on visual elements
     4. color pallete is C64

Character JSON:
${JSON.stringify(characterJson, null, 2)}

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
    
    if (!finalPrompt.toLowerCase().includes("style of nft pfp art without backgroud, a portrait of")) {
      finalPrompt = "style of nft pfp art without backgroud, a portrait of, " + finalPrompt;
    }

    return finalPrompt;

  } catch (error) {
    console.error('Error creating AI portrait prompt:', error);
    return "style of nft pfp art without backgroud, a portrait of";
  }
}