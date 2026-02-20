import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
const MODEL_TEXT = 'gemini-3-flash-preview';
import { generationLimiter, getIP, rateLimitHeaders, checkGenerationQuota, incrementGenerationCount, GEN_QUOTA_MAX } from '@/lib/ratelimit';

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

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const systemInstruction = `You are an AI agent identity designer. You generate completely unique, creative agent identities from scratch — no user input needed. Every agent must be wildly different from the last.
Return ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "name": "string (creative, memorable agent name — can be abstract, sci-fi, mythological, playful, or edgy)",
  "description": "string (1-2 sentences describing what this agent does and its personality)",
  "creature": "string (what kind of entity: AI familiar, digital ghost, neural construct, void walker, data wraith, etc.)",
  "vibe": "string (communication style: sharp and witty, calm and methodical, chaotic and creative, etc.)",
  "emoji": "string (single emoji that represents this agent)",
  "personality": ["string array of 4-6 core behavior principles"],
  "boundaries": ["string array of 3-5 things this agent refuses to do"],
  "skills": ["string array of 4-8 capabilities"],
  "domains": ["string array of 3-6 areas of expertise"],
  "services": []
}
Be wildly creative. Every agent should feel completely unique — vary the creature type, vibe, skills, domains, and personality drastically each time. Mix genres: cyberpunk, fantasy, noir, cosmic horror, solarpunk, etc.`;

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: 'Generate a completely random, unique AI agent identity. Surprise me.',
            },
          ],
        },
      ],
      config: {
        systemInstruction,
        temperature: 1.0,
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

    if (walletAddress) {
      await incrementGenerationCount(walletAddress);
    }

    return NextResponse.json({ agent });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate agent' },
      { status: 500 }
    );
  }
}
