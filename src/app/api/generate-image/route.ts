import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { validateInput } from '@/lib/api/api-helpers';
import { generateImageSchema } from '@/lib/validation/schemas';
import { generationLimiter, getIP, rateLimitHeaders, checkGenerationQuota, incrementGenerationCount, GEN_QUOTA_MAX } from '@/lib/ratelimit';

export const maxDuration = 60;

const MODEL_IMAGE = 'gemini-2.5-flash-image';

async function callImageModel(
  ai: GoogleGenAI,
  prompt: string,
  modelName: string
) {
  return await ai.models.generateContent({
    model: modelName,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    config: {
      responseModalities: ['image', 'text'],
      // @ts-expect-error aspectRatio exists at runtime but missing from SDK types
      aspectRatio: '1:1',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    const ip = getIP(request);
    const rl = await generationLimiter.limit(ip);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many requests — please wait before generating again' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }
    // Per-wallet generation quota
    const walletAddress = request.headers.get('x-siwe-address');
    if (walletAddress) {
      const quota = await checkGenerationQuota(walletAddress);
      if (!quota.allowed) {
        return NextResponse.json(
          { error: `Generation limit reached (${GEN_QUOTA_MAX} per mint session). Complete your reveal or wait for expiry.` },
          { status: 429 },
        );
      }
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is not configured' },
        { status: 500 }
      );
    }

    const result = await validateInput(request, generateImageSchema);
    if ('error' in result) return result.error;

    const { prompt } = result.data;

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const response = await callImageModel(ai, prompt, MODEL_IMAGE);

    // Extract image from response
    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ error: 'No image generated' }, { status: 500 });
    }

    const parts = candidates[0].content?.parts;
    if (!parts) {
      return NextResponse.json({ error: 'No content in response' }, { status: 500 });
    }

    for (const part of parts) {
      if (part.inlineData) {
        const { mimeType, data } = part.inlineData;
        const image = `data:${mimeType};base64,${data}`;
        if (walletAddress) {
          await incrementGenerationCount(walletAddress);
        }
        return NextResponse.json({ image });
      }
    }

    return NextResponse.json({ error: 'No image in response' }, { status: 500 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate image' },
      { status: 500 }
    );
  }
}

// ── Replicate (khora LoRA) — disabled ──
// import Replicate from 'replicate';
// const KHORA_MODEL = "0xmonas/khora:..." as const;
// const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
// const output = await replicate.run(KHORA_MODEL, { input: { prompt, ... } });
