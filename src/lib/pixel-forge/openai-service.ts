// OpenAI image generation service for Pixel Forge.
// Uses gpt-image-2 (gpt-image-2-2026-04-21) via the official Images API.
// Supports text-to-image (generations) and image edits (with reference).
//
// Notes from the gpt-image-2 docs:
//   - Sizes: 1024x1024 (default), 1536x1024, 1024x1536, 2048x2048, etc.
//     Both edges must be multiples of 16, max edge 3840, min total
//     pixels 655,360. We always request 1024x1024 then downscale on the
//     client to match the canvas with nearest-neighbor.
//   - Quality: "low" (cheapest, fastest, ~$0.006), "medium", "high", "auto".
//     We default to "low" for the pixel-art workflow — final quality comes
//     from the downscale + chroma-key + palette pass anyway.
//   - Transparent backgrounds are NOT supported on gpt-image-2. We rely on
//     the prompt asking for a flat #00FF00 chroma-key background, then
//     remove it client-side via the existing auto-chroma pass.

export interface GenerateSelection {
  x: number;
  y: number;
  w: number;
  h: number;
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
  model: string = 'gpt-image-2-2026-04-21',
  spriteMode: boolean = false,
  layoutGuideBase64?: string,
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

  // gpt-image-1 supports these output sizes: 1024x1024, 1536x1024, 1024x1536, auto
  // We always request 1024x1024 then downscale on the client (nearest-neighbor) to match canvas.
  const apiSize = '1024x1024';

  try {
    let res: Response;
    if (referenceImageBase64) {
      // Image edits endpoint — supports multiple reference images via the
      // `image[]` field (gpt-image-2 docs). We send the canonical reference
      // first, then optionally a layout guide image.
      const formData = new FormData();
      formData.append('model', model);
      formData.append('prompt', instruction);
      formData.append('size', apiSize);
      formData.append('quality', 'low');
      formData.append('n', '1');

      const toBlob = (dataUrl: string): Blob => {
        const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
        const byteString = atob(base64);
        const bytes = new Uint8Array(byteString.length);
        for (let i = 0; i < byteString.length; i++) bytes[i] = byteString.charCodeAt(i);
        return new Blob([bytes], { type: 'image/png' });
      };

      formData.append('image', toBlob(referenceImageBase64), 'reference.png');
      if (layoutGuideBase64) {
        formData.append('image', toBlob(layoutGuideBase64), 'layout-guide.png');
      }

      res = await fetch('https://api.openai.com/v1/images/edits', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      });
    } else {
      // Text-to-image generations endpoint
      res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          prompt: instruction,
          size: apiSize,
          quality: 'low',
          n: 1,
        }),
      });
    }

    if (!res.ok) {
      const errorBody = await res.text().catch(() => '');
      const lower = errorBody.toLowerCase();
      if (res.status === 401) throw new Error('Invalid OpenAI API key. Check your key at platform.openai.com.');
      if (res.status === 429 || lower.includes('rate_limit') || lower.includes('quota')) {
        throw new Error('OpenAI rate limit or quota exceeded. Check your usage tier.');
      }
      if (res.status === 400 && lower.includes('safety')) {
        throw new Error('OpenAI safety filter blocked this prompt. Try rephrasing.');
      }
      throw new Error(`OpenAI request failed (${res.status}). ${errorBody.slice(0, 120)}`);
    }

    const data = await res.json();
    const b64 = data?.data?.[0]?.b64_json;
    const url = data?.data?.[0]?.url;
    if (b64) return `data:image/png;base64,${b64}`;
    if (url) {
      // Some accounts may return URL instead of b64 — fetch and convert
      const imgRes = await fetch(url);
      const imgBlob = await imgRes.blob();
      return await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(imgBlob);
      });
    }
    throw new Error('No image data returned from OpenAI.');
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.startsWith('OpenAI ') || error.message.startsWith('Invalid ') || error.message.startsWith('No image')) {
        throw error;
      }
      const msg = error.message.toLowerCase();
      if (msg.includes('network') || msg.includes('fetch')) {
        throw new Error('Network error. Check your connection.');
      }
    }
    throw new Error('OpenAI generation failed. Please try again.');
  }
}

function paletteLine(has: boolean, colors: string[]): string {
  return has ? `\nUse ONLY these colors: ${colors.join(', ')}.` : '';
}
