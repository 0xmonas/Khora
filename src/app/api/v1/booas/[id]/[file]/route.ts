import { NextRequest, NextResponse } from 'next/server';
import { rejectUnknownParams } from '@/lib/server/query-params';
import { caipRef, getBooaAgent, getBooaCurrent, isTokenId, readArt } from '@/lib/server/booa';
import { BOOA_ETH_ADDRESS } from '@/lib/contracts/booa-eth';
import { toERC8004, toIdentityMd, toSoulMd, toUserMd, traitsToAgent } from '@/utils/helpers/exportFormats';

export const maxDuration = 15;

const SHORT = 'public, s-maxage=300, stale-while-revalidate=600';
const IMMUTABLE = 'public, max-age=31536000, s-maxage=31536000, immutable';
const ART = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';
const MD = 'text/markdown; charset=utf-8';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id: rawId, file } = await params;
  const id = Number(rawId);
  if (!isTokenId(id)) return NextResponse.json({ error: 'Unknown BOOA' }, { status: 404 });
  const bad = rejectUnknownParams(req.nextUrl.searchParams, file === 'image.svg' ? ['variant'] : []);
  if (bad) return bad;

  try {
    if (file === 'image.svg') {
      const variant = req.nextUrl.searchParams.get('variant') ?? 'live';
      if (variant !== 'live' && variant !== 'original') {
        return NextResponse.json({ error: 'variant must be live or original' }, { status: 400 });
      }
      const { svg } = await readArt(id, variant);
      return new NextResponse(svg, {
        headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': variant === 'original' ? IMMUTABLE : ART },
      });
    }

    if (!['soul.md', 'identity.md', 'agent.json', 'erc8004.json', 'openclaw.zip'].includes(file)) {
      return NextResponse.json({ error: 'Unknown file' }, { status: 404 });
    }

    const current = await getBooaCurrent(id);
    const agent = traitsToAgent(current.attributes);
    const ref = caipRef(id);

    if (file === 'soul.md') {
      return new NextResponse(toSoulMd(agent), { headers: { 'Content-Type': MD, 'Cache-Control': SHORT } });
    }
    if (file === 'identity.md') {
      return new NextResponse(toIdentityMd(agent, ref, current.attributes), { headers: { 'Content-Type': MD, 'Cache-Control': SHORT } });
    }
    if (file === 'agent.json') {
      const { image: _i, services: _s, ...data } = agent;
      return NextResponse.json({ ...data, caipRef: ref }, { headers: { 'Cache-Control': SHORT } });
    }
    if (file === 'erc8004.json') {
      const link = await getBooaAgent(id);
      const registration = toERC8004(
        agent,
        current.owner ? { contract: `eip155:1:${BOOA_ETH_ADDRESS}`, tokenId: id, originalOwner: current.owner } : undefined,
        link ? { agentId: link.agentId, agentRegistry: 'eip155:1:0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' } : undefined,
      );
      registration.image = `https://booa.app/api/booa-image/${id}`;
      return NextResponse.json(registration, { headers: { 'Cache-Control': SHORT } });
    }

    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    zip.file('IDENTITY.md', toIdentityMd(agent, ref, current.attributes));
    zip.file('SOUL.md', toSoulMd(agent));
    zip.file('USER.md', toUserMd());
    const name = agent.name.toLowerCase().replace(/[^a-z0-9]/g, '-') || `booa-${id}`;
    return new NextResponse(await zip.generateAsync({ type: 'nodebuffer' }), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${name}-openclaw.zip"`,
        'Cache-Control': SHORT,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Chain read failed' }, { status: 502 });
  }
}
