// Image generation for Pixel Forge.
// Routes through OpenRouter's chat-completions endpoint with the
// `openai/gpt-5.4-image-2` model so users can BYOK an OpenRouter key
// without OpenAI org verification. Returns a data URL.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface GenerateSelection {
  x: number;
  y: number;
  w: number;
  h: number;
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

function imageContentFromBase64OrDataUrl(input: string): ContentPart {
  const url = input.startsWith('data:') ? input : `data:image/png;base64,${input}`;
  return { type: 'image_url', image_url: { url } };
}

export async function generateOpenAIImage(
  apiKey: string,
  prompt: string,
  width: number,
  height: number,
  paletteColors: string[],
  referenceImageBase64?: string,
  selection?: GenerateSelection | null,
  hasExistingArt: boolean = false,
  transparentBg: boolean = true,
  model: string = 'openai/gpt-5.4-image-2',
  spriteMode: boolean = false,
  layoutGuideBase64?: string,
  extraReferenceBase64?: string,
): Promise<string> {
  const hasPalette = paletteColors.length > 0;
  const paletteRule = hasPalette ? `\nUse ONLY these colors: ${paletteColors.join(', ')}.` : '';

  let instruction: string;
  if (spriteMode) {
    const bgLine = transparentBg
      ? '\nBackground must be BRIGHT GREEN (#00FF00) for chroma key removal.'
      : '';
    instruction = `${prompt}${bgLine}${paletteRule}`;
  } else if (selection) {
    const outsideRule = transparentBg
      ? 'OUTSIDE the target rectangle: BRIGHT GREEN (#00FF00) for chroma-key.'
      : 'OUTSIDE the target rectangle: fitting backdrop, no pure #00FF00.';
    instruction = `Pixel art generator. TASK: "${prompt}". The reference image is a ${width}x${height} canvas. Draw INSIDE rectangle x=${selection.x}, y=${selection.y}, width=${selection.w}, height=${selection.h}. RULES: full ${width}x${height} output. ${outsideRule} Hard pixel edges. No anti-alias.${paletteRule}`;
  } else if (hasExistingArt) {
    const bgRule = transparentBg
      ? 'Empty areas: BRIGHT GREEN (#00FF00) for chroma-key.'
      : 'Empty areas: fitting backdrop, no pure #00FF00.';
    instruction = `Pixel art generator. TASK: "${prompt}". Reference is existing ${width}x${height} pixel art. Preserve important elements, only overwrite where new content goes. Output exactly ${width}x${height} px. ${bgRule} Hard pixel edges only.${paletteRule}`;
  } else {
    const bgLine = transparentBg
      ? '\nBackground: BRIGHT GREEN (#00FF00) for chroma-key.'
      : '\nBackground: fitting backdrop, no pure #00FF00.';
    instruction = `Generate a ${width}x${height} pixel art sprite of: ${prompt}. Style: retro 8-bit, clean lines, hard pixel edges, no anti-aliasing.${paletteLine(hasPalette, paletteColors)}${bgLine}`;
  }

  if (extraReferenceBase64) {
    instruction += referenceImageBase64
      ? '\n\nADDITIONAL REFERENCE: a second image is attached after the canvas. The FIRST image is the current canvas to edit; the SECOND is a guide — apply the task using its style, colors, pose, or content as the reference.'
      : '\n\nREFERENCE: an image is attached. Use it as the style/content guide for the task.';
  }

  const content: ContentPart[] = [{ type: 'text', text: instruction }];
  if (referenceImageBase64) content.push(imageContentFromBase64OrDataUrl(referenceImageBase64));
  if (extraReferenceBase64) content.push(imageContentFromBase64OrDataUrl(extraReferenceBase64));
  if (layoutGuideBase64) content.push(imageContentFromBase64OrDataUrl(layoutGuideBase64));

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://booa.app',
        'X-Title': 'BOOA Pixel Forge',
      },
      body: JSON.stringify({
        model,
        modalities: ['image', 'text'],
        messages: [{ role: 'user', content }],
      }),
    });

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      const lower = errorBody.toLowerCase();
      if (res.status === 401) throw new Error('Invalid OpenRouter API key. Check your key at openrouter.ai/keys.');
      if (res.status === 402) throw new Error('OpenRouter credits exhausted. Top up at openrouter.ai.');
      if (res.status === 429 || lower.includes('rate_limit') || lower.includes('quota')) {
        throw new Error('OpenRouter rate limit or quota exceeded.');
      }
      if (res.status === 400 && lower.includes('safety')) {
        throw new Error('Safety filter blocked this prompt. Try rephrasing.');
      }
      throw new Error(`OpenRouter request failed (${res.status}). ${errorBody.slice(0, 120)}`);
    }

    const data = await res.json();
    const url: string | undefined = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) {
      const text = data?.choices?.[0]?.message?.content;
      throw new Error(`No image data returned from OpenRouter. ${typeof text === 'string' ? text.slice(0, 200) : ''}`);
    }
    if (url.startsWith('data:')) return url;
    // Remote URL fallback — fetch and convert to data URL
    const imgRes = await fetch(url);
    const imgBlob = await imgRes.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(imgBlob);
    });
  } catch (error) {
    if (error instanceof Error) {
      if (
        error.message.startsWith('OpenRouter ') ||
        error.message.startsWith('Invalid ') ||
        error.message.startsWith('No image') ||
        error.message.startsWith('Safety ')
      ) {
        throw error;
      }
      const msg = error.message.toLowerCase();
      if (msg.includes('network') || msg.includes('fetch')) {
        throw new Error('Network error. Check your connection.');
      }
    }
    throw new Error('OpenRouter generation failed. Please try again.');
  }
}

function paletteLine(has: boolean, colors: string[]): string {
  return has ? `\nUse ONLY these colors: ${colors.join(', ')}.` : '';
}
