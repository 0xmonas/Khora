import { notFound } from 'next/navigation';
import { CHAIN_CONFIG } from '@/types/agent';
import type { SupportedChain } from '@/types/agent';
import { getV2Address, getV2StorageAddress, BOOA_V2_ABI, BOOA_V2_STORAGE_ABI } from '@/lib/contracts/booa-v2';
import { calculateAgentScores, fetch8004ScanScore, type AgentScoreInput } from '@/utils/agent-score';
import { AgentCard } from './AgentCard';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import type { Metadata } from 'next';
import { getRedis } from '@/lib/server/redis';

export const revalidate = 60;

const redis = getRedis();

interface OnChainTrait {
  trait_type: string;
  value: string;
}

interface AgentData {
  tokenId: number;
  chain: SupportedChain;
  chainName: string;
  owner: string;
  name: string;
  description: string;
  creature: string;
  vibe: string;
  emoji: string;
  image: string;
  skills: string[];
  domains: string[];
  personality: string[];
  services: { name: string; endpoint?: string; skills?: string[]; domains?: string[] }[];
  x402Support: boolean;
  supportedTrust: string[];
  registryAgentId: number | null;
  registeredBy: string | null;
}

async function fetchBOOAAgent(chain: SupportedChain, tokenId: number): Promise<AgentData | null> {
  try {
    const { createPublicClient, http, fallback } = await import('viem');
    const config = CHAIN_CONFIG[chain];
    const chainId = config.chainId;

    if (chain !== 'shape' && chain !== 'shape-sepolia') return null;

    const booaAddress = getV2Address(chainId);
    const storageAddress = getV2StorageAddress(chainId);

    if (!booaAddress || booaAddress.length <= 2) return null;

    const client = createPublicClient({
      transport: fallback(config.rpcUrls.map((url) => http(url))),
    });

    const [owner, traitsHex] = await Promise.all([
      client.readContract({
        address: booaAddress,
        abi: BOOA_V2_ABI,
        functionName: 'ownerOf',
        args: [BigInt(tokenId)],
      }) as Promise<string>,
      client.readContract({
        address: storageAddress,
        abi: BOOA_V2_STORAGE_ABI,
        functionName: 'getTraits',
        args: [BigInt(tokenId)],
      }) as Promise<string>,
    ]);

    let traits: OnChainTrait[] = [];
    if (traitsHex && traitsHex !== '0x') {
      try {
        const hex = traitsHex as `0x${string}`;
        const bytes = new Uint8Array(
          hex.slice(2).match(/.{1,2}/g)!.map(b => parseInt(b, 16))
        );
        const decoded = new TextDecoder().decode(bytes);
        traits = JSON.parse(decoded);
      } catch { /* empty */ }
    }

    const clamp = (s: string, max: number) => s.length > max ? s.slice(0, max) : s;
    const get = (type: string, max = 200) => clamp(traits.find(t => t.trait_type === type)?.value || '', max);
    const getAll = (type: string, max = 100) => traits.filter(t => t.trait_type === type).map(t => clamp(t.value, max));

    let image = '';
    try {
      const tokenURI = await client.readContract({
        address: booaAddress,
        abi: BOOA_V2_ABI,
        functionName: 'tokenURI',
        args: [BigInt(tokenId)],
      }) as string;

      if (tokenURI.startsWith('data:')) {
        const base64 = tokenURI.split(',')[1];
        const json = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
        image = json.image || '';
      }
    } catch { /* empty */ }

    let registryAgentId: number | null = null;
    let registeredBy: string | null = null;
    let services: AgentData['services'] = [];
    let x402Support = false;
    let supportedTrust: string[] = [];
    let personality: string[] = [];

    try {
      const registryKey = `agent:registry:${chainId}:${tokenId}`;
      const registryData = await redis.get<{ agentId: number; registeredBy?: string }>(registryKey);
      if (registryData) {
        registryAgentId = registryData.agentId;
        registeredBy = registryData.registeredBy || null;
      }

      const metadataKey = `agent:metadata:${chainId}:${tokenId}`;
      const metadata = await redis.get<Record<string, unknown>>(metadataKey);
      if (metadata) {
        services = (metadata.services as AgentData['services']) || [];
        x402Support = (metadata.x402Support as boolean) || false;
        supportedTrust = (metadata.supportedTrust as string[]) || [];
        personality = (metadata.personality as string[]) || [];
      }
    } catch { /* empty */ }

    return {
      tokenId,
      chain,
      chainName: config.name,
      owner: owner as string,
      name: get('Name') || `BOOA #${tokenId}`,
      description: get('Description', 500) || '',
      creature: get('Creature') || '',
      vibe: get('Vibe') || '',
      emoji: get('Emoji') || '',
      image,
      skills: getAll('Skill'),
      domains: getAll('Domain'),
      personality,
      services,
      x402Support,
      supportedTrust,
      registryAgentId,
      registeredBy,
    };
  } catch {
    return null;
  }
}

type PageParams = { chain: string; agentId: string };

export async function generateMetadata(
  { params }: { params: Promise<PageParams> },
): Promise<Metadata> {
  const { chain, agentId } = await params;
  if (!CHAIN_CONFIG[chain as SupportedChain]) return { title: 'Not Found' };

  const agent = await fetchBOOAAgent(chain as SupportedChain, Number(agentId));
  if (!agent) return { title: 'Not Found' };

  const title = `${agent.emoji ? agent.emoji + ' ' : ''}${agent.name} — BOOA #${agent.tokenId}`;
  const description = agent.description || `${agent.creature} · ${agent.vibe}`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'profile',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
  };
}

export default async function AgentPage({
  params,
}: {
  params: Promise<PageParams>;
}) {
  const { chain, agentId } = await params;

  if (!CHAIN_CONFIG[chain as SupportedChain] || !Number.isInteger(Number(agentId))) {
    notFound();
  }

  const agent = await fetchBOOAAgent(chain as SupportedChain, Number(agentId));
  if (!agent) notFound();

  const chainId = CHAIN_CONFIG[chain as SupportedChain].chainId;

  let scores = agent.registryAgentId !== null
    ? await fetch8004ScanScore(chainId, agent.registryAgentId)
    : null;

  if (!scores) {
    const scoreInput: AgentScoreInput = {
      name: agent.name,
      description: agent.description || null,
      skills: agent.skills,
      domains: agent.domains,
      services: agent.services,
      x402Support: agent.x402Support,
      supportedTrust: agent.supportedTrust,
      chainCount: agent.registryAgentId !== null ? 1 : 0,
      hasImage: !!agent.image,
      personality: agent.personality,
      boundaries: [],
    };
    scores = calculateAgentScores(scoreInput);
  }
  const isMainnet = chainId !== 84532 && chainId !== 11011;
  const scan8004Url = agent.registryAgentId !== null
    ? isMainnet
      ? `https://www.8004scan.io/agents/${chain}/${agent.registryAgentId}`
      : `https://testnet.8004scan.io/agents/${chain}/${agent.registryAgentId}`
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="flex flex-col items-center gap-4">
          <AgentCard
            agent={agent}
            scores={scores}
            scan8004Url={scan8004Url}
          />
          {agent.registeredBy && agent.owner && agent.registeredBy.toLowerCase() !== agent.owner.toLowerCase() && (
            <p className="font-mono text-[10px] text-amber-600 dark:text-amber-400 text-center max-w-xs">
              8004 identity registered by {agent.registeredBy.slice(0, 6)}...{agent.registeredBy.slice(-4)}
            </p>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
