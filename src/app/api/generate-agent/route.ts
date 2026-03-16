import { NextRequest, NextResponse } from 'next/server';
import { getAI } from '@/lib/server/gemini';
const MODEL_TEXT = 'gemini-3-flash-preview';
import { generationLimiter, getIP, rateLimitHeaders, checkGenerationQuota, incrementGenerationCount, GEN_QUOTA_MAX, checkDailyCap, incrementDailyCap } from '@/lib/ratelimit';
import { ALL_OASF_SKILLS, ALL_OASF_DOMAINS } from '@/lib/oasf-taxonomy';

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    // ── Global daily cap ──
    const daily = await checkDailyCap();
    if (!daily.allowed) {
      return NextResponse.json(
        { error: 'Daily generation limit reached. Please try again tomorrow.' },
        { status: 503 },
      );
    }

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

    const ai = getAI();

    const skillsList = Array.from(ALL_OASF_SKILLS).join(', ');
    const domainsList = Array.from(ALL_OASF_DOMAINS).join(', ');

    const systemInstruction = `You are an AI agent identity designer. You generate completely unique, creative agent identities from scratch — no user input needed. Every agent must be wildly different from the last.

STEP 1: Pick skills and domains FIRST from the OASF lists below.
STEP 2: Then build the entire character identity around those choices.

OASF SKILLS (pick 4-8, EXACT label text only):
${skillsList}

OASF DOMAINS (pick 3-6, EXACT label text only):
${domainsList}

Return ONLY valid JSON matching this exact schema (no markdown, no explanation).
IMPORTANT: Output fields in this EXACT order — skills and domains FIRST:
{
  "skills": ["4-8 from OASF skills list above"],
  "domains": ["3-6 from OASF domains list above"],
  "name": "string (creative, memorable agent name — built around the chosen skills/domains)",
  "description": "string (1-2 sentences — what this agent does, consistent with skills/domains)",
  "creature": "string (entity type that fits the skill/domain combo: AI familiar, digital ghost, neural construct, void walker, data wraith, etc.)",
  "vibe": "string (communication style that matches the expertise: sharp and witty, calm and methodical, chaotic and creative, etc.)",
  "emoji": "string (single emoji that represents this agent's domain)",
  "personality": ["4-6 core behavior principles — MUST reflect the chosen skills/domains"],
  "boundaries": ["3-5 things this agent refuses — MUST be consistent with its expertise"],
  "services": []
}

COHERENCE RULES:
- A DeFi+Blockchain agent should have principles about trustlessness, transparency, or financial sovereignty — not generic AI platitudes.
- A healthcare domain agent should refuse financial advice; a cybersecurity agent should refuse helping with malicious exploits.
- The whole identity should feel like ONE coherent character, not random parts stitched together.

Be wildly creative. Every agent should feel completely unique — vary the creature type, vibe, skills, domains, and personality drastically each time. Mix genres: cyberpunk, fantasy, noir, cosmic horror, solarpunk, etc.
IMPORTANT: skills and domains MUST be exact matches from the lists above. Do not invent new ones.`;

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

    if (jsonStr.length > 50_000) {
      return NextResponse.json({ error: 'AI response too large' }, { status: 500 });
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
    agent.services = [];

    // Validate skills/domains against OASF taxonomy — filter out hallucinated entries
    agent.skills = (agent.skills || []).filter((s: string) => ALL_OASF_SKILLS.has(s));
    agent.domains = (agent.domains || []).filter((d: string) => ALL_OASF_DOMAINS.has(d));

    if (walletAddress) {
      await incrementGenerationCount(walletAddress);
    }
    await incrementDailyCap();

    return NextResponse.json({ agent });
  } catch (error) {
    console.error('generate-agent error:', error);
    return NextResponse.json(
      { error: 'Failed to generate agent' },
      { status: 500 }
    );
  }
}
