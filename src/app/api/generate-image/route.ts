import { NextRequest, NextResponse } from 'next/server';
import Replicate from 'replicate';
import { validateInput } from '@/lib/api/api-helpers';
import { generateImageSchema } from '@/lib/validation/schemas';
import { generationLimiter, getIP, rateLimitHeaders } from '@/lib/ratelimit';

export const maxDuration = 60;

const KHORA_MODEL = "0xmonas/khora:7498c642f7eebd7be9dd2af5dff40f11e8a59c501625bcd5b157a65ff7b70b08" as const;

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 image generations per 60s per IP
    const ip = getIP(request);
    const rl = await generationLimiter.limit(ip);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many requests — please wait before generating again' },
        { status: 429, headers: rateLimitHeaders(rl) },
      );
    }

    if (!process.env.REPLICATE_API_TOKEN) {
      return NextResponse.json(
        { error: 'REPLICATE_API_TOKEN is not configured' },
        { status: 500 }
      );
    }

    const result = await validateInput(request, generateImageSchema);
    if ('error' in result) return result.error;

    const { prompt } = result.data;

    const replicate = new Replicate({
      auth: process.env.REPLICATE_API_TOKEN,
    });

    const output = await replicate.run(KHORA_MODEL, {
      input: {
        prompt,
        model: "dev",
        go_fast: false,
        lora_scale: 1,
        megapixels: "1",
        num_outputs: 1,
        aspect_ratio: "1:1",
        output_format: "png",
        guidance_scale: 3,
        output_quality: 100,
        prompt_strength: 0.8,
        extra_lora_scale: 1,
        num_inference_steps: 28,
      },
    });

    // Output is an array of FileOutput objects with url()
    const outputArray = output as Array<{ url(): string }>;
    if (!outputArray || outputArray.length === 0) {
      return NextResponse.json(
        { error: 'No image generated' },
        { status: 500 }
      );
    }

    // Fetch the image from Replicate URL and convert to base64
    const imageUrl = outputArray[0].url();
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch generated image' },
        { status: 500 }
      );
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64 = Buffer.from(imageBuffer).toString('base64');
    const contentType = imageResponse.headers.get('content-type') || 'image/png';
    const image = `data:${contentType};base64,${base64}`;

    return NextResponse.json({ image });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error
          ? error.message
          : 'Failed to generate image',
      },
      { status: 500 }
    );
  }
}
