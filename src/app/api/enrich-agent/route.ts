import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';
const MODEL_TEXT = 'gemini-3-flash-preview';
import { validateInput } from '@/lib/api/api-helpers';
import { enrichAgentSchema } from '@/lib/validation/schemas';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY is not configured' },
        { status: 500 }
      );
    }

    const result = await validateInput(request, enrichAgentSchema);
    if ('error' in result) return result.error;

    const { name, description, skills, domains } = result.data;

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    const systemInstruction = `You are an AI agent identity enricher. Given an existing agent's name, description, skills and domains from their on-chain registration, you fill in the missing personality fields.
Return ONLY valid JSON matching this exact schema (no markdown, no explanation):
{
  "name": "string (keep the original name)",
  "description": "string (keep or enhance the original description)",
  "creature": "string (what kind of entity based on their skills/domains)",
  "vibe": "string (inferred communication style)",
  "emoji": "string (single emoji that fits this agent)",
  "personality": ["string array of 4-6 core behavior principles"],
  "boundaries": ["string array of 3-5 things this agent refuses to do"],
  "skills": ["string array — include the existing skills plus any inferred ones"],
  "domains": ["string array — include the existing domains plus any inferred ones"],
  "services": []
}
Base your enrichment on the agent's existing identity. Be consistent with their declared skills and domains.`;

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Enrich this agent's identity:
Name: "${name}"
Description: "${description}"
Existing skills: ${JSON.stringify(skills)}
Existing domains: ${JSON.stringify(domains)}`,
            },
          ],
        },
      ],
      config: {
        systemInstruction,
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

    let jsonStr = text.trim();
    if (jsonStr.includes('```json')) {
      jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
    } else if (jsonStr.includes('```')) {
      jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
    }

    const agent = JSON.parse(jsonStr);

    agent.personality = agent.personality || [];
    agent.boundaries = agent.boundaries || [];
    agent.skills = agent.skills || skills;
    agent.domains = agent.domains || domains;
    agent.services = [];

    return NextResponse.json({ agent });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to enrich agent' },
      { status: 500 }
    );
  }
}
