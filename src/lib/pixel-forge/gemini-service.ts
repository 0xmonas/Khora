import { GoogleGenAI, Modality } from '@google/genai';

export async function generatePixelAsset(
  apiKey: string,
  prompt: string,
  width: number,
  height: number,
  paletteColors: string[],
  referenceImageBase64?: string,
): Promise<string> {
  const paletteHex = paletteColors.join(', ');
  const ai = new GoogleGenAI({ apiKey });
  const model = 'gemini-3-pro-image-preview';

  const parts: { text?: string; inlineData?: { data: string; mimeType: string } }[] = [];

  if (referenceImageBase64) {
    const base64Data = referenceImageBase64.replace(/^data:image\/\w+;base64,/, '');
    parts.push({ inlineData: { data: base64Data, mimeType: 'image/png' } });
    parts.push({
      text: `You are a pixel art generator. TASK: Generate a TRANSPARENT OVERLAY containing ONLY the requested item: "${prompt}".

RULES:
1. DO NOT redraw the original character. Output ONLY the new item.
2. Place the item where it belongs on the character (hat on head, sword in hand).
3. Output must be exactly ${width}x${height} pixels.
4. Pure pixel art style. No anti-aliasing, no blur. Hard pixel edges only.
5. Use ONLY these colors: ${paletteHex}.
6. Background must be BRIGHT GREEN (#00FF00) for chroma key removal.`,
    });
  } else {
    parts.push({
      text: `Generate a ${width}x${height} pixel art sprite of: ${prompt}.
Style: Retro, 8-bit, clean lines, pure pixel art with hard edges.
Use ONLY these colors: ${paletteHex}.
Background must be BRIGHT GREEN (#00FF00) for chroma key removal.`,
    });
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: { parts },
      config: { responseModalities: [Modality.IMAGE] },
    });

    const generated = response.candidates?.[0]?.content?.parts?.[0];
    if (generated?.inlineData?.data) {
      return `data:image/png;base64,${generated.inlineData.data}`;
    }
    throw new Error('No image data returned from Gemini.');
  } catch (error) {
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('quota') || msg.includes('resource_exhausted') || msg.includes('429')) {
        throw new Error('API quota exceeded. Check your Gemini API plan and billing.');
      }
      if (msg.includes('api key not valid') || msg.includes('api_key_invalid') || msg.includes('401')) {
        throw new Error('Invalid API key. Please check your Gemini API key.');
      }
      if (msg.includes('network') || msg.includes('fetch')) {
        throw new Error('Network error. Check your connection.');
      }
    }
    throw new Error('Generation failed. Please try again.');
  }
}
