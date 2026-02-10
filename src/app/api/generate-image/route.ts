import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
const MODEL_IMAGE = 'gemini-2.5-flash-image';
const MODEL_IMAGE_FLASH = 'gemini-2.5-flash-image';
import { validateInput } from '@/lib/api/api-helpers';
import { generateImageSchema } from '@/lib/validation/schemas';
import { generationLimiter, getIP, rateLimitHeaders } from '@/lib/ratelimit';

export const maxDuration = 60;

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
    },
  });
}

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

    let response;
    try {
      response = await callImageModel(ai, prompt, MODEL_IMAGE);
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      const errMsg = err.message || '';
      const isPermissionError =
        errMsg.includes('403') || errMsg.includes('PERMISSION_DENIED');

      if (isPermissionError) {
        // Fallback to Flash model
        response = await callImageModel(ai, prompt, MODEL_IMAGE_FLASH);
      } else {
        throw err;
      }
    }

    // Extract image from response
    const candidates = response.candidates;
    if (!candidates || candidates.length === 0) {
      return NextResponse.json(
        { error: 'No image generated' },
        { status: 500 }
      );
    }

    const parts = candidates[0].content?.parts;
    if (!parts) {
      return NextResponse.json(
        { error: 'No content in response' },
        { status: 500 }
      );
    }

    // Find the image part
    for (const part of parts) {
      if (part.inlineData) {
        const { mimeType, data } = part.inlineData;
        const image = `data:${mimeType};base64,${data}`;
        return NextResponse.json({ image });
      }
    }

    return NextResponse.json(
      { error: 'No image in response' },
      { status: 500 }
    );
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
