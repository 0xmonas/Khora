import { ImageResponse } from 'next/og';
import { CHAIN_CONFIG } from '@/types/agent';
import type { SupportedChain } from '@/types/agent';
import { getV2Address, getV2StorageAddress, BOOA_V2_ABI, BOOA_V2_STORAGE_ABI } from '@/lib/contracts/booa-v2';
import { calculateAgentScores, type AgentScoreInput } from '@/utils/agent-score';

export const revalidate = 300;
export const contentType = 'image/png';
export const size = { width: 600, height: 400 };

interface OnChainTrait { trait_type: string; value: string }

export default async function OGImage({
  params,
}: {
  params: Promise<{ chain: string; agentId: string }>;
}) {
  const { chain, agentId } = await params;

  const parsedId = Number(agentId);
  if (
    (chain !== 'shape' && chain !== 'shape-sepolia') ||
    !Number.isInteger(parsedId) ||
    parsedId < 0
  ) {
    return new ImageResponse(
      <div style={{ display: 'flex', width: '100%', height: '100%', backgroundColor: '#0a0a0a', color: '#fff', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>
        Not Found
      </div>,
      { ...size },
    );
  }

  let name = `BOOA #${agentId}`;
  let creature = '';
  let vibe = '';
  let emoji = '';
  let rank = 'D';
  let overall = 0;
  let skills: string[] = [];
  let imageUrl = '';
  const chainName = CHAIN_CONFIG[chain as SupportedChain].name;

  try {
    const { createPublicClient, http, fallback } = await import('viem');
    const config = CHAIN_CONFIG[chain as SupportedChain];
    const chainId = config.chainId;
    const booaAddress = getV2Address(chainId);
    const storageAddress = getV2StorageAddress(chainId);

    const client = createPublicClient({
      transport: fallback(config.rpcUrls.map((url) => http(url))),
    });

    // Fetch traits and tokenURI in parallel
    const [traitsHex, tokenURI] = await Promise.all([
      client.readContract({
        address: storageAddress,
        abi: BOOA_V2_STORAGE_ABI,
        functionName: 'getTraits',
        args: [BigInt(parsedId)],
      }) as Promise<string>,
      client.readContract({
        address: booaAddress,
        abi: BOOA_V2_ABI,
        functionName: 'tokenURI',
        args: [BigInt(parsedId)],
      }) as Promise<string>,
    ]);

    // Parse traits
    let traits: OnChainTrait[] = [];
    if (traitsHex && traitsHex !== '0x') {
      const hex = traitsHex as `0x${string}`;
      const bytes = new Uint8Array(
        hex.slice(2).match(/.{1,2}/g)!.map(b => parseInt(b, 16))
      );
      traits = JSON.parse(new TextDecoder().decode(bytes));
    }

    const get = (type: string) => traits.find(t => t.trait_type === type)?.value || '';
    const getAll = (type: string) => traits.filter(t => t.trait_type === type).map(t => t.value);

    name = get('Name') || name;
    creature = get('Creature');
    vibe = get('Vibe');
    emoji = get('Emoji');
    skills = getAll('Skill').slice(0, 4);

    // Get image from tokenURI
    if (tokenURI?.startsWith('data:')) {
      const base64 = tokenURI.split(',')[1];
      const json = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
      imageUrl = json.image || '';
    }

    const scoreInput: AgentScoreInput = {
      name, description: get('Description') || null,
      skills: getAll('Skill'), domains: getAll('Domain'),
      services: [], x402Support: false, supportedTrust: [],
      chainCount: 0, hasImage: !!imageUrl, personality: [], boundaries: [],
    };
    const scores = calculateAgentScores(scoreInput);
    rank = scores.rank;
    overall = scores.overall;
  } catch {
    // fallback to defaults
  }

  const rankColors: Record<string, string> = {
    S: '#f59e0b', A: '#8b5cf6', B: '#3b82f6', C: '#737373', D: '#a3a3a3',
  };

  return new ImageResponse(
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: '#0a0a0a',
        color: '#fff',
        fontFamily: 'monospace',
        padding: 40,
      }}
    >
      {/* Left: image */}
      <div style={{ display: 'flex', width: 200, height: 200, marginRight: 32, border: '2px solid #333', overflow: 'hidden' }}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={name} width={200} height={200} style={{ imageRendering: 'pixelated', objectFit: 'contain' }} />
        ) : (
          <div style={{ display: 'flex', width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: '#171717', fontSize: 64, color: '#333' }}>?</div>
        )}
      </div>

      {/* Right: info */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
            <span style={{ fontSize: 22, fontWeight: 'bold' }}>
              {emoji && `${emoji} `}{name}
            </span>
            <div style={{ display: 'flex', width: 36, height: 36, border: `2px solid ${rankColors[rank] || '#a3a3a3'}`, alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 'bold', color: rankColors[rank] || '#a3a3a3' }}>
              {rank}
            </div>
          </div>
          <span style={{ fontSize: 11, color: '#737373', textTransform: 'uppercase', letterSpacing: 2 }}>
            {creature}{vibe ? ` · ${vibe}` : ''} · BOOA #{agentId} · {chainName}
          </span>
          <span style={{ fontSize: 12, color: '#525252', marginTop: 8 }}>
            Score {overall}/100
          </span>
        </div>

        {/* Skills */}
        {skills.length > 0 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 16 }}>
            {skills.map((s) => (
              <span key={s} style={{ fontSize: 10, padding: '3px 8px', border: '1px solid #333', color: '#a3a3a3' }}>
                {s}
              </span>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <span style={{ fontSize: 10, color: '#525252' }}>On-chain AI Agent PFP</span>
          <span style={{ fontSize: 14, fontWeight: 'bold', color: '#737373' }}>BOOA</span>
        </div>
      </div>
    </div>,
    { ...size },
  );
}
