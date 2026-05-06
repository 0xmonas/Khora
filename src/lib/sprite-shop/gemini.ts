// Sprite Shop — Gemini provider. Direct client-side call (BYOK), key never
// touches BOOA backend. Mirrors the SDK pattern used by Pixel Forge but with
// two reference images and our identity-locked sprite atlas prompt.

import { GoogleGenAI, Modality } from '@google/genai';

const DEFAULT_MODEL = 'gemini-3-pro-image-preview';

export interface GeminiSpriteArgs {
  apiKey: string;
  prompt: string;
  referenceLayoutBase64: string;   // PNG base64, no data: prefix
  referenceAvatarBase64: string;   // PNG base64, no data: prefix
  model?: string;
}

/** Calls Gemini and returns a base64-encoded PNG (no data URL prefix). */
export async function generateSpriteAtlasGemini(args: GeminiSpriteArgs): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: args.apiKey });

  const parts = [
    { inlineData: { data: args.referenceLayoutBase64, mimeType: 'image/png' } },
    { inlineData: { data: args.referenceAvatarBase64, mimeType: 'image/png' } },
    { text: args.prompt },
  ];

  let response;
  try {
    response = await ai.models.generateContent({
      model: args.model || DEFAULT_MODEL,
      contents: { parts },
      config: { responseModalities: [Modality.IMAGE] },
    });
  } catch (e) {
    if (e instanceof Error) {
      const msg = e.message.toLowerCase();
      if (msg.includes('quota') || msg.includes('resource_exhausted') || msg.includes('429')) {
        throw new Error('Gemini API quota exceeded — check your plan and billing.');
      }
      if (msg.includes('api key not valid') || msg.includes('api_key_invalid') || msg.includes('401')) {
        throw new Error('Invalid Gemini API key.');
      }
      throw new Error(`Gemini error: ${e.message}`);
    }
    throw e;
  }

  const generated = response.candidates?.[0]?.content?.parts?.[0];
  if (generated?.inlineData?.data) {
    return generated.inlineData.data;
  }
  throw new Error('Gemini returned no image data.');
}
