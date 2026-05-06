const DEFAULT_MODEL = 'gpt-image-2-2026-04-21';
const OUTPUT_SIZE = '1024x1024';

export interface OpenAISpriteArgs {
  apiKey: string;
  prompt: string;
  referenceLayoutBase64?: string;
  referenceAvatarBase64: string;
  model?: string;
}

function base64ToBlob(b64: string, type = 'image/png'): Blob {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}

async function callOpenAIEdits(form: FormData, apiKey: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/images/edits', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
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

export async function generateSpriteAtlasOpenAI(args: OpenAISpriteArgs): Promise<string> {
  const form = new FormData();
  form.append('model', args.model || DEFAULT_MODEL);
  form.append('prompt', args.prompt);
  form.append('size', OUTPUT_SIZE);
  form.append('quality', 'low');
  form.append('n', '1');
  if (args.referenceLayoutBase64) {
    form.append('image', base64ToBlob(args.referenceLayoutBase64), 'reference-layout.png');
  }
  form.append('image', base64ToBlob(args.referenceAvatarBase64), 'reference-avatar.png');
  return callOpenAIEdits(form, args.apiKey);
}

export async function generateExtendedBodyOpenAI(args: { apiKey: string; prompt: string; bustBase64: string; model?: string }): Promise<string> {
  const form = new FormData();
  form.append('model', args.model || DEFAULT_MODEL);
  form.append('prompt', args.prompt);
  form.append('size', OUTPUT_SIZE);
  form.append('quality', 'low');
  form.append('n', '1');
  form.append('image', base64ToBlob(args.bustBase64), 'bust.png');
  return callOpenAIEdits(form, args.apiKey);
}
