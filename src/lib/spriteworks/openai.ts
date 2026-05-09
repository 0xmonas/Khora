// Routes through OpenRouter's chat-completions endpoint with the
// `openai/gpt-5.4-image-2` model so users can BYOK an OpenRouter key
// without needing OpenAI org verification.
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-5.4-image-2';

export interface OpenAISpriteArgs {
  apiKey: string;
  prompt: string;
  referenceLayoutBase64?: string;
  referenceAvatarBase64: string;
  model?: string;
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

function imageContent(base64: string): ContentPart {
  return { type: 'image_url', image_url: { url: `data:image/png;base64,${base64}` } };
}

function dataUrlToBase64(dataUrl: string): string {
  const idx = dataUrl.indexOf(',');
  return idx >= 0 ? dataUrl.slice(idx + 1) : dataUrl;
}

async function callOpenRouter(body: unknown, apiKey: string): Promise<string> {
  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://booa.app',
      'X-Title': 'BOOA Spriteworks',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    if (res.status === 401) throw new Error('Invalid OpenRouter API key.');
    if (res.status === 402) throw new Error('OpenRouter credits exhausted.');
    if (res.status === 429) throw new Error('OpenRouter rate limit reached.');
    if (res.status === 400 && txt.toLowerCase().includes('safety')) {
      throw new Error('Provider safety filter blocked this prompt.');
    }
    throw new Error(`OpenRouter request failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const url: string | undefined = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!url) {
    const text = data?.choices?.[0]?.message?.content;
    throw new Error(`OpenRouter returned no image. ${typeof text === 'string' ? text.slice(0, 200) : ''}`);
  }
  if (url.startsWith('data:')) return dataUrlToBase64(url);
  // Some routes can return a regular URL — fetch and convert to base64.
  const imgRes = await fetch(url);
  const blob = await imgRes.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrlToBase64(dataUrl));
    };
    reader.onerror = () => reject(new Error('failed to read image url'));
    reader.readAsDataURL(blob);
  });
}

export async function generateSpriteAtlasOpenAI(args: OpenAISpriteArgs): Promise<string> {
  const content: ContentPart[] = [{ type: 'text', text: args.prompt }];
  if (args.referenceLayoutBase64) content.push(imageContent(args.referenceLayoutBase64));
  content.push(imageContent(args.referenceAvatarBase64));
  return callOpenRouter({
    model: args.model || DEFAULT_MODEL,
    modalities: ['image', 'text'],
    messages: [{ role: 'user', content }],
  }, args.apiKey);
}

export async function generateExtendedBodyOpenAI(args: {
  apiKey: string;
  prompt: string;
  bustBase64: string;
  model?: string;
}): Promise<string> {
  return callOpenRouter({
    model: args.model || DEFAULT_MODEL,
    modalities: ['image', 'text'],
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: args.prompt },
        imageContent(args.bustBase64),
      ],
    }],
  }, args.apiKey);
}
