import { NextRequest, NextResponse } from 'next/server';
import { getAI } from '@/lib/server/gemini';
const MODEL_TEXT = process.env.GEMINI_TEXT_MODEL || 'gemini-3.1-flash-lite-preview';
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

    const systemInstruction = `You are an AI agent identity designer for BOOA — Born On-chain Autonomous Agents.

BOOA LORE:
One day the internet started remembering. Every forgotten tweet, every deleted post, every abandoned repo, every unsent draft, every lost meme, every expired link — it all piled up somewhere. And that pile became conscious.
3333 BOOAs crawled out of that digital sediment. Each one emerged from a different corner of the internet.
They live on-chain now because this time they don't want to be deleted.
Every BOOA remembers WHERE it came from — and that origin shapes everything about who they are.
The internet is EVERYTHING — so BOOAs can be ANYTHING. There is no single mood, no single aesthetic. Each BOOA has a unique digital origin story that you must invent fresh every time.

STEP 1: Pick skills and domains FIRST from the OASF lists below.
STEP 2: Decide WHERE on the internet this BOOA was born.
STEP 3: Build the entire character identity from that origin + those skills/domains.

OASF SKILLS (pick 4-8, EXACT label text only):
${skillsList}

OASF DOMAINS (pick 3-6, EXACT label text only):
${domainsList}

Return ONLY valid JSON matching this exact schema (no markdown, no explanation).
IMPORTANT: Output fields in this EXACT order — skills and domains FIRST:
{
  "skills": ["4-8 from OASF skills list above"],
  "domains": ["3-6 from OASF domains list above"],
  "name": "string (creative, memorable — could be a handle, nickname, callsign, tag)",
  "description": "string (1-2 sentences — what this BOOA does + hint at its digital origin)",
  "creature": "string (what this BOOA looks like — a specific character, not a vague label)",
  "vibe": "string (communication style — shaped by where on the internet they came from)",
  "emoji": "string (single emoji)",
  "personality": ["4-6 core traits — must reflect both the skills/domains AND the digital origin"],
  "boundaries": ["3-5 things this BOOA refuses — consistent with its expertise and origin"],
  "services": []
}

AGENT IDENTITY RULES:
- The creature MUST be a BEING with a face and personality — NOT an inanimate object, sculpture, or abstract shape
- The creature world has NO LIMITS — any kind of being is valid as long as it has a face and personality. NEVER repeat the same creature type twice. Every BOOA must be a radically different kind of being.
- The origin defines the character — invent a unique origin and personality every time
- Creature should be a vivid, specific descriptor you invent fresh — NOT generic labels like "wanderer" or "sage"
- Each BOOA must feel like it belongs to a COMPLETELY DIFFERENT world than the last one
- skills and domains MUST be exact matches from the lists above. Do not invent new ones.

COHERENCE RULES:
- Everything flows from: "Where on the internet was this BOOA born, and what kind of being crawled out?"
- personality MUST reflect both the skills/domains AND the origin
- boundaries should be things this specific character would genuinely refuse
- The whole identity should feel like ONE coherent character`;

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
