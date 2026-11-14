import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { caipRef, getBooaCurrent, isTokenId, readArt } from '@/lib/server/booa';
import { traitsToAgent, toSoulMd, toIdentityMd, toERC8004 } from '@/utils/helpers/exportFormats';

export const maxDuration = 15;

let agentDefenseCache: string | null = null;
async function getAgentDefense(): Promise<string | null> {
  if (agentDefenseCache !== null) return agentDefenseCache;
  try {
    agentDefenseCache = await readFile(path.join(process.cwd(), 'public', 'agent-defense.md'), 'utf-8');
    return agentDefenseCache;
  } catch {
    return null;
  }
}

const CHAINS = new Set([1, 360]);
const VALID_FILES = new Set(['soul.md', 'identity.md', 'avatar.svg', 'agent.json', 'erc8004.json']);
const CACHE = { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' };
const ART = { 'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400' };
const MD = 'text/markdown; charset=utf-8';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chainId: string; tokenId: string; file?: string[] }> },
) {
  const { chainId: chainIdStr, tokenId: tokenIdStr, file } = await params;
  const chainId = Number(chainIdStr);
  const tokenId = Number(tokenIdStr);

  if (!CHAINS.has(chainId)) {
    return NextResponse.json({ error: 'Unsupported chain' }, { status: 400 });
  }
  if (!isTokenId(tokenId)) {
    return NextResponse.json({ error: 'Invalid tokenId' }, { status: 400 });
  }

  const fileName = file?.[0]?.toLowerCase();
  if (fileName && !VALID_FILES.has(fileName)) {
    return NextResponse.json({ error: `Valid files: ${Array.from(VALID_FILES).join(', ')}` }, { status: 400 });
  }

  try {
    if (fileName === 'avatar.svg') {
      const { svg } = await readArt(tokenId, 'live');
      return new NextResponse(svg, { headers: { ...ART, 'Content-Type': 'image/svg+xml; charset=utf-8' } });
    }

    const current = await getBooaCurrent(tokenId);
    const agent = traitsToAgent(current.attributes);
    const ref = caipRef(tokenId);
    const { image: _, ...agentData } = agent;
    const agentJson = { ...agentData, attributes: current.attributes, caipRef: ref };

    if (fileName === 'soul.md') {
      return new NextResponse(toSoulMd(agent), { headers: { ...CACHE, 'Content-Type': MD } });
    }
    if (fileName === 'identity.md') {
      return new NextResponse(toIdentityMd(agent, ref, current.attributes), { headers: { ...CACHE, 'Content-Type': MD } });
    }
    if (fileName === 'agent.json') {
      return NextResponse.json(agentJson, { headers: CACHE });
    }
    if (fileName === 'erc8004.json') {
      return NextResponse.json(toERC8004(agent), { headers: CACHE });
    }

    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    zip.file('SOUL.md', toSoulMd(agent));
    zip.file('IDENTITY.md', toIdentityMd(agent, ref, current.attributes));
    zip.file('avatar.svg', (await readArt(tokenId, 'live')).svg);
    zip.file('agent.json', JSON.stringify(agentJson, null, 2));
    zip.file('erc8004.json', JSON.stringify(toERC8004(agent), null, 2));
    const agentDefense = await getAgentDefense();
    if (agentDefense) zip.file('agent-defense.md', agentDefense);

    const safeName = agent.name.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'agent';
    return new NextResponse(await zip.generateAsync({ type: 'nodebuffer' }), {
      headers: {
        ...CACHE,
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${safeName}-agent-files.zip"`,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch on-chain data' }, { status: 502 });
  }
}
