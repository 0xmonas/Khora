export interface RetroDiffusionParams {
  replicateToken: string;
  prompt: string;
  width: number;
  height: number;
  style: string;
  transparentBg: boolean;
  inputImage?: string;
  strength?: number;
  bypassPromptExpansion?: boolean;
}

async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to convert image'));
    reader.readAsDataURL(blob);
  });
}

export async function generateRetroDiffusion(params: RetroDiffusionParams): Promise<string> {
  const res = await fetch('/api/pixel-forge-replicate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  if (!res.ok) {
    let msg = 'Generation failed.';
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch { /* noop */ }
    throw new Error(msg);
  }

  const data = await res.json();
  if (!data?.url) throw new Error('No image returned.');
  return await urlToDataUrl(data.url);
}
