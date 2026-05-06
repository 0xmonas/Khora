// Sprite Shop — OpenAI provider. gpt-image-2 via /v1/images/edits with two
// reference images. Direct client-side BYOK call. The image-edit endpoint
// accepts multiple input images and a text prompt; output size is fixed
// (1024×1024 by default — we resize to the atlas geometry post-generation).

const DEFAULT_MODEL = 'gpt-image-2-2026-04-21';
const OUTPUT_SIZE = '1024x1024';

export interface OpenAISpriteArgs {
  apiKey: string;
  prompt: string;
  referenceLayoutBase64: string;
  referenceAvatarBase64: string;
  model?: string;
}

function base64ToBlob(b64: string, type = 'image/png'): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

/** Returns base64 PNG (no data URL prefix). */
export async function generateSpriteAtlasOpenAI(args: OpenAISpriteArgs): Promise<string> {
  const form = new FormData();
  form.append('model', args.model || DEFAULT_MODEL);
  form.append('prompt', args.prompt);
  form.append('size', OUTPUT_SIZE);
  form.append('quality', 'low'); // pixel art doesn't need high; we re-snap palette
  form.append('n', '1');
  // OpenAI image-edits accepts multiple `image` parts (multipart array form).
  form.append('image', base64ToBlob(args.referenceLayoutBase64), 'reference-layout.png');
  form.append('image', base64ToBlob(args.referenceAvatarBase64), 'reference-avatar.png');

  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${args.apiKey}` },
    body: form,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 401) throw new Error('Invalid OpenAI API key.');
    if (res.status === 429) throw new Error('OpenAI rate limit / quota exceeded.');
    if (res.status === 400 && body.toLowerCase().includes('safety')) {
      throw new Error('OpenAI safety filter blocked this prompt.');
    }
    throw new Error(`OpenAI request failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const data = await res.json();
  const b64 = data?.data?.[0]?.b64_json;
  if (b64) return b64;
  const url = data?.data?.[0]?.url;
  if (url) {
    const r = await fetch(url);
    const blob = await r.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const idx = dataUrl.indexOf(',');
        resolve(idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl);
      };
      reader.onerror = () => reject(new Error('failed to read image url'));
      reader.readAsDataURL(blob);
    });
  }
  throw new Error('OpenAI returned no image data.');
}
