import { notFound } from 'next/navigation';
import { CHAIN_CONFIG } from '@/types/agent';
import type { SupportedChain } from '@/types/agent';
import { getV2Address, getV2StorageAddress, BOOA_V2_ABI, BOOA_V2_STORAGE_ABI } from '@/lib/contracts/booa-v2';
import { calculateAgentScores, fetch8004ScanScore, type AgentScoreInput } from '@/utils/agent-score';
import { AgentCard } from './AgentCard';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import Image from 'next/image';
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
}

async function fetchBOOAAgent(chain: SupportedChain, tokenId: number): Promise<AgentData | null> {
  try {
    const { createPublicClient, http, fallback } = await import('viem');
    const { mainnet, shape, shapeSepolia } = await import('viem/chains');
    const config = CHAIN_CONFIG[chain];
    const chainId = config.chainId;

    // The URL chain selects which ERC-8004 registry to read. Where the NFT itself
    // lives is independent: Ethereum is canonical post-migration, Shape still holds
    // not-yet-migrated tokens. Try each home and use the first that resolves, so a
    // migrated token (burned on Shape) no longer 404s.
    const homeChainIds = chainId === shapeSepolia.id || chainId === 84532
      ? [shapeSepolia.id]
      : [mainnet.id, shape.id];

    let home: {
      booa: `0x${string}`;
      storage: `0x${string}`;
      owner: string;
      client: ReturnType<typeof createPublicClient>;
    } | null = null;

    for (const homeChainId of homeChainIds) {
      const booa = getV2Address(homeChainId);
      if (!booa || booa.length <= 2) continue;
      const homeCfg = Object.values(CHAIN_CONFIG).find((c) => c.chainId === homeChainId);
      const homeClient = createPublicClient({
        transport: homeCfg?.rpcUrls?.length
          ? fallback(homeCfg.rpcUrls.map((url) => http(url)))
          : http(),
      });
      try {
        const owner = (await homeClient.readContract({
          address: booa,
          abi: BOOA_V2_ABI,
          functionName: 'ownerOf',
          args: [BigInt(tokenId)],
        })) as string;
        home = { booa, storage: getV2StorageAddress(homeChainId), owner, client: homeClient };
        break;
      } catch { /* burned here (migrated) or RPC failed — try the next home */ }
    }

    if (!home) return null;

    const client = home.client;
    const booaAddress = home.booa;
    const owner = home.owner;

    let traitsHex = '0x';
    try {
      traitsHex = (await client.readContract({
        address: home.storage,
        abi: BOOA_V2_STORAGE_ABI,
        functionName: 'getTraits',
        args: [BigInt(tokenId)],
      })) as string;
    } catch { /* traits unreadable — fall back to defaults below */ }

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
    let services: AgentData['services'] = [];
    let x402Support = false;
    let supportedTrust: string[] = [];
    let personality: string[] = [];

    try {
      const registryKey = `agent:registry:${chainId}:${tokenId}`;
      const registryData = await redis.get<{ agentId: number }>(registryKey);
      if (registryData) {
        registryAgentId = registryData.agentId;
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

    // Awaken binds through the adapter and never writes the Redis registry key, so a
    // freshly awakened BOOA would render the "not registered yet" placeholder. Fall
    // back to the onchain AgentBound scan, which is the same source My Agents uses.
    if (registryAgentId === null) {
      try {
        const { findAwakening } = await import('@/lib/server/awakened');
        const awakening = await findAwakening(chainId, tokenId);
        if (awakening) registryAgentId = awakening.agentId;
      } catch { /* leave null — placeholder is correct if nothing is bound */ }
    }

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

  // If this BOOA hasn't been registered as an ERC-8004 agent (native or adapter-bound),
  // render a minimal "not yet registered" placeholder instead of a card with estimated data.
  if (agent.registryAgentId === null) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        <Header />
        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="flex flex-col items-center gap-4 max-w-sm text-center">
            {agent.image && (
              <Image src={agent.image} alt={agent.name} width={160} height={160} className="border-2 border-neutral-700 dark:border-neutral-200" unoptimized />
            )}
            <p className="font-mono text-sm dark:text-white">{agent.emoji ? `${agent.emoji} ` : ''}{agent.name}</p>
            <p className="font-mono text-xs text-neutral-500">BOOA #{agent.tokenId} on {agent.chainName}</p>
            <p className="font-mono text-[11px] text-neutral-600 dark:text-neutral-400 leading-relaxed mt-2">
              This BOOA hasn&apos;t been registered as an ERC-8004 agent yet. Identity cards are only generated for registered or adapter-bound agents.
            </p>
            <a
              href="/booa/gallery"
              className="mt-2 inline-flex items-center justify-center h-10 px-4 border-2 border-neutral-700 dark:border-neutral-200 font-mono text-xs hover:bg-neutral-700 hover:text-white dark:hover:bg-neutral-200 dark:hover:text-neutral-900 transition-colors"
            >
              Open in Gallery
            </a>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // Registered path: try live 8004scan first, fall back to estimated local score.
  const liveScores = await fetch8004ScanScore(chainId, agent.registryAgentId);
  const isLiveScore = liveScores !== null;
  let scores = liveScores;

  if (!scores) {
    const scoreInput: AgentScoreInput = {
      name: agent.name,
      description: agent.description || null,
      skills: agent.skills,
      domains: agent.domains,
      services: agent.services,
      x402Support: agent.x402Support,
      supportedTrust: agent.supportedTrust,
      chainCount: 1,
      hasImage: !!agent.image,
      personality: agent.personality,
      boundaries: [],
    };
    scores = calculateAgentScores(scoreInput);
  }
  const isMainnet = chainId !== 84532 && chainId !== 11011;
  const scan8004Url = isMainnet
    ? `https://www.8004scan.io/agents/${chain}/${agent.registryAgentId}`
    : `https://testnet.8004scan.io/agents/${chain}/${agent.registryAgentId}`;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="flex flex-col items-center gap-4">
          <AgentCard
            agent={agent}
            scores={scores}
            scan8004Url={scan8004Url}
            isLiveScore={isLiveScore}
          />
        </div>
      </main>
      <Footer />
    </div>
  );
}
