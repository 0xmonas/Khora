import { GoogleGenAI, Modality } from '@google/genai';

const DEFAULT_MODEL = 'gemini-3-pro-image-preview';

export interface GeminiSpriteArgs {
  apiKey: string;
  prompt: string;
  referenceLayoutBase64?: string;
  referenceAvatarBase64: string;
  model?: string;
}

async function callGemini(apiKey: string, model: string, parts: { inlineData?: { data: string; mimeType: string }; text?: string }[]): Promise<string> {
  const ai = new GoogleGenAI({ apiKey });
  let response;
  try {
    response = await ai.models.generateContent({
      model,
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
  if (generated?.inlineData?.data) return generated.inlineData.data;
  throw new Error('Gemini returned no image data.');
}

export async function generateSpriteAtlasGemini(args: GeminiSpriteArgs): Promise<string> {
  const parts: { inlineData?: { data: string; mimeType: string }; text?: string }[] = [];
  if (args.referenceLayoutBase64) {
    parts.push({ inlineData: { data: args.referenceLayoutBase64, mimeType: 'image/png' } });
  }
  parts.push({ inlineData: { data: args.referenceAvatarBase64, mimeType: 'image/png' } });
  parts.push({ text: args.prompt });
  return callGemini(args.apiKey, args.model || DEFAULT_MODEL, parts);
}

export async function generateExtendedBodyGemini(args: { apiKey: string; prompt: string; bustBase64: string; model?: string }): Promise<string> {
  return callGemini(args.apiKey, args.model || DEFAULT_MODEL, [
    { inlineData: { data: args.bustBase64, mimeType: 'image/png' } },
    { text: args.prompt },
  ]);
}
