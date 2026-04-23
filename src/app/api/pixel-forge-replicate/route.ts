import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import { shape } from 'viem/chains';
import Replicate from 'replicate';
import { BOOA_V2_ABI, getV2Address } from '@/lib/contracts/booa-v2';
import { getRedis } from '@/lib/server/redis';

export const maxDuration = 60;

const ALLOWED_MODEL = 'retro-diffusion/rd-plus' as const;
const ALLOWED_STYLES = new Set([
  'default', 'retro', 'classic', 'watercolor', 'textured', 'cartoon',
  'character_turnaround', 'environment', 'isometric', 'isometric_asset',
  'topdown_map', 'topdown_asset', 'ui_element', 'item_sheet',
  'low_res', 'topdown_item', 'skill_icon', 'mc_item', 'mc_texture',
]);

const SHAPE_RPC = process.env.NEXT_PUBLIC_SHAPE_RPC_URL || 'https://mainnet.shape.network';

async function isHolder(address: string): Promise<boolean> {
  const redis = getRedis();
  const key = `holder:v2:${address.toLowerCase()}`;
  const cached = await redis.get<number>(key);
  if (cached !== null) return cached >= 1;

  try {
    const client = createPublicClient({ transport: http(SHAPE_RPC) });
    const balance = await client.readContract({
      address: getV2Address(shape.id),
      abi: BOOA_V2_ABI,
      functionName: 'balanceOf',
      args: [address as `0x${string}`],
    });
    const count = Number(balance);
    await redis.set(key, count, { ex: 300 });
    return count >= 1;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const walletAddress = request.headers.get('x-siwe-address');
  if (!walletAddress) {
    return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  }

  if (!(await isHolder(walletAddress))) {
    return NextResponse.json({ error: 'Holder only' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const replicateToken = typeof body.replicateToken === 'string' ? body.replicateToken : '';
  const prompt = typeof body.prompt === 'string' ? body.prompt.slice(0, 500) : '';
  const style = typeof body.style === 'string' ? body.style : 'default';
  const width = Number(body.width);
  const height = Number(body.height);
  const strength = Number(body.strength ?? 0.7);
  const transparentBg = Boolean(body.transparentBg);
  const inputImage = typeof body.inputImage === 'string' ? body.inputImage : undefined;
  const bypassPromptExpansion = Boolean(body.bypassPromptExpansion);

  if (!replicateToken.startsWith('r8_') || replicateToken.length < 30) {
    return NextResponse.json({ error: 'Invalid Replicate token format' }, { status: 400 });
  }
  if (!prompt.trim()) {
    return NextResponse.json({ error: 'Prompt required' }, { status: 400 });
  }
  if (!ALLOWED_STYLES.has(style)) {
    return NextResponse.json({ error: 'Invalid style' }, { status: 400 });
  }
  if (!Number.isInteger(width) || width < 16 || width > 384) {
    return NextResponse.json({ error: 'Invalid width' }, { status: 400 });
  }
  if (!Number.isInteger(height) || height < 16 || height > 384) {
    return NextResponse.json({ error: 'Invalid height' }, { status: 400 });
  }
  if (!Number.isFinite(strength) || strength < 0 || strength > 1) {
    return NextResponse.json({ error: 'Invalid strength' }, { status: 400 });
  }
  if (inputImage && !inputImage.startsWith('data:image/')) {
    return NextResponse.json({ error: 'Invalid input image' }, { status: 400 });
  }

  const input: Record<string, unknown> = {
    prompt,
    style,
    width,
    height,
    num_images: 1,
    remove_bg: transparentBg,
  };
  if (bypassPromptExpansion) {
    input.bypass_prompt_expansion = true;
  }
  if (inputImage) {
    input.input_image = inputImage;
    input.strength = strength;
  }

  try {
    const replicate = new Replicate({ auth: replicateToken });
    const output = await replicate.run(ALLOWED_MODEL, { input });

    let url: string | null = null;
    if (Array.isArray(output) && output.length > 0) {
      const first = output[0];
      if (typeof first === 'string') url = first;
      else if (first && typeof (first as { url: () => string }).url === 'function') {
        url = (first as { url: () => string }).url();
      }
    } else if (typeof output === 'string') {
      url = output;
    }

    if (!url) {
      return NextResponse.json({ error: 'No image returned' }, { status: 502 });
    }
    return NextResponse.json({ url });
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : '';
    if (msg.includes('401') || msg.includes('unauthorized') || msg.includes('authentication')) {
      return NextResponse.json({ error: 'Invalid Replicate token' }, { status: 401 });
    }
    if (msg.includes('quota') || msg.includes('insufficient') || msg.includes('billing')) {
      return NextResponse.json({ error: 'Replicate quota or billing issue' }, { status: 402 });
    }
    if (msg.includes('rate') || msg.includes('429')) {
      return NextResponse.json({ error: 'Replicate rate limit reached' }, { status: 429 });
    }
    return NextResponse.json({ error: 'Generation failed. Try again.' }, { status: 500 });
  }
}
