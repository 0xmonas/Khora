export async function fetch8004ScanScore(chainId: number, tokenId: number): Promise<AgentScores | null> {
  try {
    const res = await fetch(`https://api.8004scan.io/api/v1/agents/scores/v5/${chainId}/${tokenId}`, {
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.total_score && data.total_score !== 0) return null;

    const overall = Math.round(data.total_score);
    let rank: string;
    if (overall >= 85) rank = 'S';
    else if (overall >= 70) rank = 'A';
    else if (overall >= 50) rank = 'B';
    else if (overall >= 30) rank = 'C';
    else rank = 'D';

    return {
      identity: Math.round(((data.engagement?.score ?? 0) + (data.publisher?.score ?? 0)) / 2),
      service: Math.round(data.service?.score ?? 0),
      trust: Math.round(data.compliance?.score ?? 0),
      reach: Math.round(data.momentum?.score ?? 0),
      overall,
      rank,
    };
  } catch {
    return null;
  }
}

export interface AgentScoreInput {
  name: string | null;
  description: string | null;
  skills: string[];
  domains: string[];
  services: { name: string; endpoint?: string }[];
  x402Support?: boolean;
  supportedTrust?: string[];
  chainCount: number; // how many chains this agent is registered on
  hasImage: boolean;
  personality?: string[];
  boundaries?: string[];
}

export interface AgentScores {
  identity: number;    // 0-100: how complete is the agent's identity
  service: number;     // 0-100: service & capability depth
  trust: number;       // 0-100: trust & security posture
  reach: number;       // 0-100: multichain presence
  overall: number;     // 0-100: weighted average
  rank: string;        // S/A/B/C/D rank label
}

export function calculateAgentScores(input: AgentScoreInput): AgentScores {
  // ── Identity Score (name, desc, image, personality, boundaries) ──
  let identity = 0;
  if (input.name) identity += 25;
  if (input.description) identity += 25;
  if (input.hasImage) identity += 20;
  if (input.personality && input.personality.length > 0) identity += 15;
  if (input.boundaries && input.boundaries.length > 0) identity += 15;

  // ── Service Score (skills, domains, services with endpoints) ──
  let service = 0;
  const skillPoints = Math.min(input.skills.length * 10, 30);
  const domainPoints = Math.min(input.domains.length * 10, 20);
  const activeServices = input.services.filter(s => s.endpoint && s.endpoint.trim());
  const servicePoints = Math.min(activeServices.length * 15, 30);
  const x402Points = input.x402Support ? 20 : 0;
  service = Math.min(skillPoints + domainPoints + servicePoints + x402Points, 100);

  // ── Trust Score (supportedTrust mechanisms) ──
  let trust = 0;
  const trustTypes = input.supportedTrust || [];
  if (trustTypes.includes('reputation')) trust += 35;
  if (trustTypes.includes('crypto-economic')) trust += 35;
  if (trustTypes.includes('tee')) trust += 30;

  // ── Reach Score (multichain presence) ──
  // 1 chain = 20, each additional = +16, max at 5+ chains
  const reach = Math.min(input.chainCount * 20, 100);

  // ── Overall (weighted) ──
  const overall = Math.round(
    identity * 0.30 +
    service * 0.30 +
    trust * 0.15 +
    reach * 0.25
  );

  // ── Rank ──
  let rank: string;
  if (overall >= 85) rank = 'S';
  else if (overall >= 70) rank = 'A';
  else if (overall >= 50) rank = 'B';
  else if (overall >= 30) rank = 'C';
  else rank = 'D';

  return { identity, service, trust, reach, overall, rank };
}
