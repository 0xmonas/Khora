import { NextRequest, NextResponse } from 'next/server';
import { CHAIN_CONFIG } from '@/types/agent';
import type { SupportedChain } from '@/types/agent';
import { getV2Address, getV2StorageAddress, BOOA_V2_ABI, BOOA_V2_STORAGE_ABI } from '@/lib/contracts/booa-v2';
import { traitsToAgent, toSoulMd, toIdentityMd, toERC8004 } from '@/utils/helpers/exportFormats';

export const maxDuration = 15;

const MAINNET_CHAIN_IDS = new Set(
  Object.values(CHAIN_CONFIG)
    .filter((_, i) => {
      const key = Object.keys(CHAIN_CONFIG)[i];
      return key !== 'base-sepolia' && key !== 'shape-sepolia';
    })
    .map(c => c.chainId)
);

const VALID_FILES = new Set(['soul.md', 'identity.md', 'avatar.svg', 'agent.json', 'erc8004.json']);

function getChainKey(chainId: number): SupportedChain | null {
  const entry = Object.entries(CHAIN_CONFIG).find(([, v]) => v.chainId === chainId);
  return entry ? entry[0] as SupportedChain : null;
}

interface OnChainData {
  traits: { trait_type: string; value: string }[];
  caipRef: string;
  svgString: string;
}

async function fetchOnChainData(chainId: number, tokenId: number): Promise<OnChainData> {
  const { createPublicClient, http, fallback } = await import('viem');
  const chainKey = getChainKey(chainId);
  if (!chainKey) throw new Error('Unsupported chain');

  const config = CHAIN_CONFIG[chainKey];
  const booaAddress = getV2Address(chainId);
  const storageAddress = getV2StorageAddress(chainId);

  if (!booaAddress || booaAddress.length <= 2) throw new Error('BOOA contract not configured');

  const client = createPublicClient({
    transport: fallback(config.rpcUrls.map((url) => http(url))),
  });

  const [traitsHex, tokenURI] = await Promise.all([
    client.readContract({
      address: storageAddress,
      abi: BOOA_V2_STORAGE_ABI,
      functionName: 'getTraits',
      args: [BigInt(tokenId)],
    }) as Promise<string>,
    client.readContract({
      address: booaAddress,
      abi: BOOA_V2_ABI,
      functionName: 'tokenURI',
      args: [BigInt(tokenId)],
    }) as Promise<string>,
  ]);

  let traits: { trait_type: string; value: string }[] = [];
  if (traitsHex && traitsHex !== '0x') {
    const hex = traitsHex as `0x${string}`;
    const bytes = new Uint8Array(
      hex.slice(2).match(/.{1,2}/g)!.map(b => parseInt(b, 16))
    );
    traits = JSON.parse(new TextDecoder().decode(bytes));
  }

  let svgString = '';
  const caipRef = `eip155:${chainId}/erc721:${booaAddress}/${tokenId}`;

  if (tokenURI.startsWith('data:')) {
    const json = JSON.parse(Buffer.from(tokenURI.split(',')[1], 'base64').toString('utf-8'));
    if (json.image?.startsWith('data:image/svg+xml;base64,')) {
      svgString = Buffer.from(json.image.split(',')[1], 'base64').toString('utf-8');
    }
  }

  return { traits, caipRef, svgString };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ chainId: string; tokenId: string; file?: string[] }> },
) {
  const { chainId: chainIdStr, tokenId: tokenIdStr, file } = await params;
  const chainId = Number(chainIdStr);
  const tokenId = Number(tokenIdStr);

  if (!Number.isInteger(chainId) || !MAINNET_CHAIN_IDS.has(chainId)) {
    return NextResponse.json({ error: 'Unsupported chain' }, { status: 400 });
  }
  if (!Number.isInteger(tokenId) || tokenId < 0 || tokenId > 10000) {
    return NextResponse.json({ error: 'Invalid tokenId' }, { status: 400 });
  }

  const fileName = file?.[0]?.toLowerCase();
  if (fileName && !VALID_FILES.has(fileName)) {
    return NextResponse.json({ error: `Valid files: ${Array.from(VALID_FILES).join(', ')}` }, { status: 400 });
  }

  try {
    const { traits, caipRef, svgString } = await fetchOnChainData(chainId, tokenId);
    if (traits.length === 0) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }

    const agent = traitsToAgent(traits);
    const cache = { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' };

    if (fileName === 'soul.md') {
      return new NextResponse(toSoulMd(agent), {
        headers: { ...cache, 'Content-Type': 'text/markdown; charset=utf-8' },
      });
    }

    if (fileName === 'identity.md') {
      return new NextResponse(toIdentityMd(agent, caipRef, traits), {
        headers: { ...cache, 'Content-Type': 'text/markdown; charset=utf-8' },
      });
    }

    if (fileName === 'avatar.svg') {
      if (!svgString) {
        return NextResponse.json({ error: 'Avatar not available' }, { status: 404 });
      }
      return new NextResponse(svgString, {
        headers: { ...cache, 'Content-Type': 'image/svg+xml; charset=utf-8' },
      });
    }

    if (fileName === 'agent.json') {
      const { image: _, ...data } = agent;
      return NextResponse.json({ ...data, caipRef }, {
        headers: cache,
      });
    }

    if (fileName === 'erc8004.json') {
      const registration = toERC8004(agent);
      return NextResponse.json(registration, {
        headers: cache,
      });
    }

    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    zip.file('SOUL.md', toSoulMd(agent));
    zip.file('IDENTITY.md', toIdentityMd(agent, caipRef, traits));
    if (svgString) zip.file('avatar.svg', svgString);
    const { image: _, ...agentData } = agent;
    zip.file('agent.json', JSON.stringify({ ...agentData, caipRef }, null, 2));
    zip.file('erc8004.json', JSON.stringify(toERC8004(agent), null, 2));

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    const safeName = agent.name.toLowerCase().replace(/[^a-z0-9]/g, '-') || 'agent';

    return new NextResponse(zipBuffer, {
      headers: {
        ...cache,
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${safeName}-agent-files.zip"`,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('revert') || msg.includes('returned no data')) {
      return NextResponse.json({ error: 'Token not found' }, { status: 404 });
    }
    return NextResponse.json({ error: 'Failed to fetch on-chain data' }, { status: 502 });
  }
}
