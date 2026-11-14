import { NextRequest, NextResponse } from 'next/server';
import { rejectUnknownParams } from '@/lib/server/query-params';
import { getBooaAgent, getBooaCurrent, getBooaMint, isTokenId, walletStale } from '@/lib/server/booa';
import { traitsToAgent } from '@/utils/helpers/exportFormats';

export const maxDuration = 15;

const FILES = ['soul.md', 'identity.md', 'agent.json', 'erc8004.json', 'openclaw.zip'];

function identity(attributes: { trait_type: string; value: string }[]) {
  const { services: _s, image: _i, ...rest } = traitsToAgent(attributes);
  return rest;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const bad = rejectUnknownParams(req.nextUrl.searchParams, []);
  if (bad) return bad;
  const id = Number((await params).id);
  if (!isTokenId(id)) return NextResponse.json({ error: 'Unknown BOOA' }, { status: 404 });

  try {
    const [current, mint, agent] = await Promise.all([getBooaCurrent(id), getBooaMint(id), getBooaAgent(id)]);
    const base = `https://booa.app/api/v1/booas/${id}`;
    return NextResponse.json(
      {
        id,
        name: current.name,
        home: current.home,
        owner: current.owner,
        identity: identity(current.attributes),
        attributes: current.attributes,
        mint: { identity: identity(mint.attributes), attributes: mint.attributes },
        agent: agent ? { ...agent, walletStale: walletStale(agent, current.owner) } : null,
        image: { live: `${base}/image.svg`, original: `${base}/image.svg?variant=original` },
        files: Object.fromEntries(FILES.map((f) => [f, `${base}/${f}`])),
      },
      { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } },
    );
  } catch {
    return NextResponse.json({ error: 'Chain read failed' }, { status: 502 });
  }
}
