import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { MODEL_TEXT, STYLES } from '@/lib/constants';
import { validateInput } from '@/lib/api/api-helpers';
import { generatePromptSchema } from '@/lib/validation/schemas';
import { generationLimiter, getIP, rateLimitHeaders } from '@/lib/ratelimit';

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 prompt generations per 60s per IP
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

    const result = await validateInput(request, generatePromptSchema);
    if ('error' in result) return result.error;

    const { prompt } = result.data;
    const style = STYLES[0]; // Khora Classic default

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: {
        systemInstruction: style.systemInstruction,
        temperature: 0.7,
      },
    });

    const text = response.text;
    if (!text) {
      return NextResponse.json(
        { error: 'No response from Gemini' },
        { status: 500 }
      );
    }

    return NextResponse.json({ prompt: text });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 }
    );
  }
}
