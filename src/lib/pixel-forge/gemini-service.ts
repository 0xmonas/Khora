import { GoogleGenAI, Modality } from '@google/genai';

export interface GenerateSelection {
  x: number;
  y: number;
  w: number;
  h: number;
}

export async function generatePixelAsset(
  apiKey: string,
  prompt: string,
  width: number,
  height: number,
  paletteColors: string[],
  referenceImageBase64?: string,
  selection?: GenerateSelection | null,
  hasExistingArt: boolean = false,
  transparentBg: boolean = true,
  model: string = 'gemini-3-pro-image-preview',
  spriteMode: boolean = false,
): Promise<string> {
  const hasPalette = paletteColors.length > 0;
  const paletteRule = hasPalette ? `\n5. Use ONLY these colors: ${paletteColors.join(', ')}.` : '';
  const paletteLine = hasPalette ? `\nUse ONLY these colors: ${paletteColors.join(', ')}.` : '';
  const ai = new GoogleGenAI({ apiKey });

  const parts: { text?: string; inlineData?: { data: string; mimeType: string } }[] = [];

  let instruction: string;
  if (spriteMode) {
    const bgLine = transparentBg
      ? '\nBackground must be BRIGHT GREEN (#00FF00) for chroma key removal.'
      : '';
    instruction = `${prompt}${bgLine}`;
  } else if (selection) {
    const outsideRule = transparentBg
      ? 'OUTSIDE the target rectangle: the background must be BRIGHT GREEN (#00FF00) so the pixels outside the rectangle get chroma-keyed away and don\'t overwrite existing canvas.'
      : 'OUTSIDE the target rectangle: extend naturally with a fitting backdrop if helpful; avoid pure green (#00FF00).';
    instruction = `You are a pixel art generator. TASK: "${prompt}".

CONTEXT: The reference image shows the current canvas. You must draw the requested content INSIDE the rectangle region at x=${selection.x}, y=${selection.y}, width=${selection.w}, height=${selection.h} (origin top-left).

RULES:
1. Output a full ${width}x${height} image.
2. INSIDE the target rectangle: draw the requested content, respecting existing art where it makes sense (e.g. draw a circle that fits the rectangle).
3. ${outsideRule}
4. Pure pixel art. No anti-aliasing, no blur. Hard pixel edges only.${paletteRule}`;
  } else if (hasExistingArt) {
    const bgRule = transparentBg
      ? 'Empty/background areas of the output must be BRIGHT GREEN (#00FF00) for chroma key removal.'
      : 'Fill empty background areas with a fitting backdrop; avoid pure green (#00FF00).';
    instruction = `You are a pixel art generator. TASK: "${prompt}".

CONTEXT: The reference image shows existing pixel art on a ${width}x${height} canvas. Treat the entire canvas as the drawing area — place the requested content wherever makes sense given the existing art. You may augment, extend, or re-arrange; do not ignore the canvas.

RULES:
1. Output must be exactly ${width}x${height} pixels.
2. Preserve important existing elements; only overwrite where the new content goes.
3. ${bgRule}
4. Pure pixel art. Hard pixel edges only.${paletteRule}`;
  } else {
    const bgLine = transparentBg
      ? '\nBackground must be BRIGHT GREEN (#00FF00) for chroma key removal.'
      : '\nBackground may be a fitting backdrop; avoid pure green (#00FF00).';
    instruction = `Generate a ${width}x${height} pixel art sprite of: ${prompt}.
Style: Retro, 8-bit, clean lines, pure pixel art with hard edges.${paletteLine}${bgLine}`;
  }

  if (referenceImageBase64) {
    const base64Data = referenceImageBase64.replace(/^data:image\/\w+;base64,/, '');
    parts.push({ inlineData: { data: base64Data, mimeType: 'image/png' } });
  }
  parts.push({ text: instruction });

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
