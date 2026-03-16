import { NextRequest, NextResponse } from 'next/server';
import { getAI } from '@/lib/server/gemini';
const MODEL_TEXT = 'gemini-3-flash-preview';
import { validateInput } from '@/lib/api/api-helpers';
import { enrichAgentSchema } from '@/lib/validation/schemas';
import { generationLimiter, getIP, rateLimitHeaders } from '@/lib/ratelimit';
import { sanitizeForPrompt } from '@/utils/helpers/sanitize';
import { ALL_OASF_SKILLS, ALL_OASF_DOMAINS } from '@/lib/oasf-taxonomy';

export const maxDuration = 60;

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

    const result = await validateInput(request, enrichAgentSchema);
    if ('error' in result) return result.error;

    const { name, description, skills, domains } = result.data;

    const ai = getAI();

    const skillsList = Array.from(ALL_OASF_SKILLS).join(', ');
    const domainsList = Array.from(ALL_OASF_DOMAINS).join(', ');

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
  "skills": ["keep existing skills + pick additional ones from the OASF list below — use EXACT label text"],
  "domains": ["keep existing domains + pick additional ones from the OASF list below — use EXACT label text"],
  "services": []
}

OASF SKILLS (pick from this list ONLY):
${skillsList}

OASF DOMAINS (pick from this list ONLY):
${domainsList}

COHERENCE RULES:
- Keep the original name and description (enhance description only if it's very short).
- personality MUST reflect the agent's skills/domains. Not generic AI platitudes.
- boundaries MUST be consistent with the agent's expertise.
- creature and vibe should feel natural for the skill/domain combination.
- If existing skills/domains are already OASF labels, keep them. If they're not in the list, find the closest OASF match and include both.
IMPORTANT: All skills and domains in the output MUST be exact matches from the OASF lists above.`;

    const response = await ai.models.generateContent({
      model: MODEL_TEXT,
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `Enrich this agent's identity:
Name: "${sanitizeForPrompt(name)}"
Description: "${sanitizeForPrompt(description)}"
Existing skills: ${JSON.stringify((skills ?? []).map(sanitizeForPrompt))}
Existing domains: ${JSON.stringify((domains ?? []).map(sanitizeForPrompt))}`,
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

    if (jsonStr.length > 50_000) {
      return NextResponse.json({ error: 'AI response too large' }, { status: 500 });
    }

    const agent = JSON.parse(jsonStr);

    agent.personality = agent.personality || [];
    agent.boundaries = agent.boundaries || [];
    agent.services = [];

    // Validate skills/domains against OASF taxonomy — filter out hallucinated entries
    agent.skills = (agent.skills || skills || []).filter((s: string) => ALL_OASF_SKILLS.has(s));
    agent.domains = (agent.domains || domains || []).filter((d: string) => ALL_OASF_DOMAINS.has(d));

    return NextResponse.json({ agent });
  } catch (error) {
    console.error('enrich-agent error:', error);
    return NextResponse.json(
      { error: 'Failed to enrich agent' },
      { status: 500 }
    );
  }
}
