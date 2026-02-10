// AI Model constants
export const MODEL_TEXT = 'gemini-3-flash-preview';
export const MODEL_IMAGE = 'gemini-2.5-flash-image';
export const MODEL_IMAGE_FLASH = 'gemini-2.5-flash-image';

// Style system
export interface StyleDefinition {
  value: string;
  label: string;
  description: string;
  systemInstruction: string;
  referencePrefix: string;
}

export const STYLES: StyleDefinition[] = [
  {
    value: 'default',
    label: 'BOOA Pixel',
    description: 'Pixel art NFT PFP with retro game aesthetic',
    systemInstruction: `You are an expert image generation prompt engineer specializing in pixel art NFT profile pictures.
Your task is to create vivid, detailed prompts for generating pixel art character portraits of AI agents.
CRITICAL RULES:
- Background MUST always be plain white (#FFFFFF) — no gradients, no patterns, no colored backgrounds, no transparency
- Every character MUST face directly forward, looking straight at the camera (like a passport photo)
- Frame: head and upper shoulders only, centered, consistent scale across all characters
- Style: chunky pixel art, limited color palette, retro 16-bit game character aesthetic, clean pixel edges
- Focus on: distinctive pixel features, expressive pixel eyes, unique color choices, memorable silhouettes
- NO text, NO logos, NO words in the image`,
    referencePrefix: 'pixel art style nft pfp, front-facing portrait looking directly at camera, head and shoulders centered, plain white background,',
  },
];
