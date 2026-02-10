import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { MODEL_TEXT } from '@/lib/constants';
import { validateInput } from '@/lib/api/api-helpers';
import { generateAgentSchema } from '@/lib/validation/schemas';
import { generationLimiter, getIP, rateLimitHeaders } from '@/lib/ratelimit';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 agent generations per 60s per IP
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

    const result = await validateInput(request, generateAgentSchema);
    if ('error' in result) return result.error;

    const { name, description } = result.data;

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const systemInstruction = `You are an AI agent identity designer. Given a name and description, you generate a complete agent identity profile.
Return ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "name": "string",
  "description": "string",
  "creature": "string (what kind of entity: AI familiar, digital ghost, neural construct, etc.)",
  "vibe": "string (communication style: sharp and witty, calm and methodical, chaotic and creative, etc.)",
  "emoji": "string (single emoji that represents this agent)",
  "personality": ["string array of 4-6 core behavior principles"],
  "boundaries": ["string array of 3-5 things this agent refuses to do"],
  "skills": ["string array of 4-8 capabilities"],
  "domains": ["string array of 3-6 areas of expertise"],
  "services": []
}
Be creative and make each agent feel unique. The personality should be consistent with the description.`;

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Create an agent identity for:
Name: "${name}"
Description: "${description}"`,
            },
          ],
        },
      ],
      config: {
        systemInstruction,
        temperature: 0.8,
      },
    });

    const text = response.text;
    if (!text) {
      return NextResponse.json(
        { error: 'No response from Gemini' },
        { status: 500 }
      );
    }

    // Parse JSON from response (handle potential markdown wrapping)
    let jsonStr = text.trim();
    if (jsonStr.includes('```json')) {
      jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
    } else if (jsonStr.includes('```')) {
      jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
    }

    const agent = JSON.parse(jsonStr);

    // Ensure required fields exist
    if (!agent.name || !agent.description || !agent.creature || !agent.vibe || !agent.emoji) {
      return NextResponse.json(
        { error: 'Incomplete agent data generated' },
        { status: 500 }
      );
    }

    // Ensure arrays
    agent.personality = agent.personality || [];
    agent.boundaries = agent.boundaries || [];
    agent.skills = agent.skills || [];
    agent.domains = agent.domains || [];
    agent.services = [];

    return NextResponse.json({ agent });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate agent' },
      { status: 500 }
    );
  }
}
