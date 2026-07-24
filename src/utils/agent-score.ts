/** 8004scan v5 dimensions, in the order and weighting the scanner itself reports. */
const SCAN_DIMENSIONS: { key: string; label: string; longLabel: string; weight: number }[] = [
  { key: 'engagement', label: 'ENGMT', longLabel: 'ENGAGEMENT', weight: 0.30 },
  { key: 'service', label: 'SERVC', longLabel: 'SERVICE', weight: 0.25 },
  { key: 'publisher', label: 'PUBLR', longLabel: 'PUBLISHER', weight: 0.20 },
  { key: 'compliance', label: 'COMPL', longLabel: 'COMPLIANCE', weight: 0.15 },
  { key: 'momentum', label: 'MOMTM', longLabel: 'MOMENTUM', weight: 0.10 },
];

function rankFor(overall: number): string {
  if (overall >= 85) return 'S';
  if (overall >= 70) return 'A';
  if (overall >= 50) return 'B';
  if (overall >= 30) return 'C';
  return 'D';
}

export async function fetch8004ScanScore(chainId: number, tokenId: number): Promise<AgentScores | null> {
  try {
    const res = await fetch(`https://api.8004scan.io/api/v1/agents/scores/v5/${chainId}/${tokenId}`, {
      signal: AbortSignal.timeout(5000),
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.total_score && data.total_score !== 0) return null;

    // A dimension the scanner has no data for comes back as null. Keep it null —
    // folding it into 0 (or averaging it with another dimension) invents a number.
    const apiWeights = (data.weights ?? {}) as Record<string, number>;
    const dimensions: ScoreDimension[] = SCAN_DIMENSIONS.map((d) => {
      const entry = data[d.key] as { score?: number; weight?: number; weighted_score?: number; explanation?: string } | null;
      const weight = entry?.weight ?? apiWeights[d.key] ?? d.weight;
      return {
        key: d.key,
        label: d.label,
        longLabel: d.longLabel,
        score: entry && typeof entry.score === 'number' ? Math.round(entry.score) : null,
        weight,
        weighted: entry && typeof entry.weighted_score === 'number' ? entry.weighted_score : 0,
        explanation: entry?.explanation ?? null,
      };
    });

    const overall = Math.round(data.total_score);

    return {
      // Legacy 4-field shape, kept so existing consumers (incl. /api/agent-card) don't break.
      // Direct aliases — never averaged across unrelated dimensions.
      identity: dimensions.find((d) => d.key === 'engagement')?.score ?? 0,
      service: dimensions.find((d) => d.key === 'service')?.score ?? 0,
      trust: dimensions.find((d) => d.key === 'compliance')?.score ?? 0,
      reach: dimensions.find((d) => d.key === 'momentum')?.score ?? 0,
      overall,
      rank: rankFor(overall),
      source: 'live',
      scoredAt: typeof data.last_scored_at === 'string' ? data.last_scored_at : null,
      version: typeof data.version === 'string' ? data.version : null,
      dimensions,
      // The scanner's own total_score is authoritative and is NOT the sum of the
      // weighted contributions (its leaderboard policy applies extra rules), so both
      // are surfaced separately rather than recomputed.
      weightedTotal: Math.round(dimensions.reduce((s, d) => s + d.weighted, 0) * 10) / 10,
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

export interface ScoreDimension {
  key: string;
  label: string;         // short label for the compact card grid
  longLabel: string;     // full label for the breakdown list
  score: number | null;  // null = the scanner has no data for this dimension yet
  weight: number;        // 0..1
  weighted: number;      // this dimension's weighted contribution
  explanation?: string | null;
}

export interface AgentScores {
  identity: number;    // 0-100: how complete is the agent's identity
  service: number;     // 0-100: service & capability depth
  trust: number;       // 0-100: trust & security posture
  reach: number;       // 0-100: multichain presence
  overall: number;     // 0-100: weighted average
  rank: string;        // S/A/B/C/D rank label
  /** 'live' = pulled from 8004scan (5 dimensions); 'estimated' = local (4 dimensions). */
  source: 'live' | 'estimated';
  dimensions: ScoreDimension[];
  weightedTotal: number;
  scoredAt?: string | null;
  version?: string | null;
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

  const dimensions: ScoreDimension[] = [
    { key: 'identity', label: 'IDENT', longLabel: 'IDENTITY', score: identity, weight: 0.30, weighted: identity * 0.30 },
    { key: 'service', label: 'SERVC', longLabel: 'SERVICE', score: service, weight: 0.30, weighted: service * 0.30 },
    { key: 'trust', label: 'TRUST', longLabel: 'TRUST', score: trust, weight: 0.15, weighted: trust * 0.15 },
    { key: 'reach', label: 'REACH', longLabel: 'REACH', score: reach, weight: 0.25, weighted: reach * 0.25 },
  ].map((d) => ({ ...d, weighted: Math.round(d.weighted * 10) / 10 }));

  return {
    identity, service, trust, reach, overall,
    rank: rankFor(overall),
    source: 'estimated',
    dimensions,
    weightedTotal: Math.round(dimensions.reduce((s, d) => s + d.weighted, 0) * 10) / 10,
  };
}
