import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetch8004ScanScore, calculateAgentScores, type AgentScoreInput } from '@/utils/agent-score';

// Shape of a real 8004scan v5 response (token 42 / agent 1970 on Shape): the scanner
// returns null for dimensions it has no data for, and total_score is NOT the sum of the
// weighted contributions — its leaderboard policy applies extra rules.
const SCAN_RESPONSE = {
  agent_name: 'Vandal-0x',
  total_score: 12.05,
  last_scored_at: '2026-07-22T13:58:49.709464Z',
  version: '5.2',
  engagement: null,
  service: { score: 30.0, weight: 0.25, weighted_score: 7.5, explanation: 'No A2A or MCP services.' },
  publisher: { score: 41.8, weight: 0.2, weighted_score: 8.36, explanation: 'Active publisher.' },
  compliance: { score: 70.0, weight: 0.15, weighted_score: 10.5, explanation: 'Good metadata compliance.' },
  momentum: null,
  weights: { engagement: 0.3, service: 0.25, publisher: 0.2, compliance: 0.15, momentum: 0.1 },
};

function mockScan(body: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => body })));
}

afterEach(() => vi.unstubAllGlobals());

describe('fetch8004ScanScore — live 5-dimension breakdown', () => {
  it('exposes all five scanner dimensions with their weights', async () => {
    mockScan(SCAN_RESPONSE);
    const s = await fetch8004ScanScore(360, 1970);

    expect(s?.source).toBe('live');
    expect(s?.dimensions.map((d) => d.key)).toEqual([
      'engagement', 'service', 'publisher', 'compliance', 'momentum',
    ]);
    expect(s?.dimensions.map((d) => d.weight)).toEqual([0.3, 0.25, 0.2, 0.15, 0.1]);
  });

  it('keeps a dimension the scanner has no data for as null, never 0', async () => {
    mockScan(SCAN_RESPONSE);
    const s = await fetch8004ScanScore(360, 1970);

    const byKey = Object.fromEntries((s?.dimensions ?? []).map((d) => [d.key, d.score]));
    expect(byKey.engagement).toBeNull();
    expect(byKey.momentum).toBeNull();
    expect(byKey.service).toBe(30);
    expect(byKey.publisher).toBe(42);
    expect(byKey.compliance).toBe(70);
  });

  it('never averages unrelated dimensions into one number', async () => {
    mockScan(SCAN_RESPONSE);
    const s = await fetch8004ScanScore(360, 1970);

    // The previous mapping produced (engagement ?? 0 + publisher) / 2 = 21 — a value the
    // scanner never reported. publisher must stay 42 and engagement must stay unknown.
    const publisher = s?.dimensions.find((d) => d.key === 'publisher')?.score;
    expect(publisher).toBe(42);
    expect(s?.dimensions.some((d) => d.score === 21)).toBe(false);
  });

  it('reports the scanner total verbatim and the weighted sum separately', async () => {
    mockScan(SCAN_RESPONSE);
    const s = await fetch8004ScanScore(360, 1970);

    expect(s?.overall).toBe(12);          // scanner's authoritative total_score
    expect(s?.weightedTotal).toBe(26.4);  // 7.5 + 8.36 + 10.5, not recomputed into overall
    expect(s?.rank).toBe('D');
    expect(s?.version).toBe('5.2');
  });

  it('maps legacy fields as direct aliases', async () => {
    mockScan(SCAN_RESPONSE);
    const s = await fetch8004ScanScore(360, 1970);

    expect(s?.service).toBe(30);   // service
    expect(s?.trust).toBe(70);     // compliance
    expect(s?.identity).toBe(0);   // engagement is null -> 0 in the legacy field only
    expect(s?.reach).toBe(0);      // momentum is null
  });

  it('returns null on a failed response or missing total_score', async () => {
    mockScan(SCAN_RESPONSE, false);
    expect(await fetch8004ScanScore(360, 1970)).toBeNull();

    mockScan({ engagement: null });
    expect(await fetch8004ScanScore(360, 1970)).toBeNull();
  });
});

describe('calculateAgentScores — local estimate', () => {
  const input: AgentScoreInput = {
    name: 'A', description: 'B', skills: ['s'], domains: ['d'],
    services: [{ name: 'web', endpoint: 'https://x.dev' }],
    x402Support: true, supportedTrust: ['reputation'],
    chainCount: 1, hasImage: true, personality: ['calm'], boundaries: ['none'],
  };

  it('is labelled estimated and carries its own 4 dimensions', async () => {
    const s = calculateAgentScores(input);
    expect(s.source).toBe('estimated');
    expect(s.dimensions.map((d) => d.key)).toEqual(['identity', 'service', 'trust', 'reach']);
    expect(s.dimensions.every((d) => typeof d.score === 'number')).toBe(true);
  });

  it('weights sum to 1 so the breakdown is coherent', async () => {
    const s = calculateAgentScores(input);
    const total = s.dimensions.reduce((acc, d) => acc + d.weight, 0);
    expect(Number(total.toFixed(2))).toBe(1);
  });
});
