import { createPublicClient, fallback, http, parseAbi } from 'viem';
import { mainnet } from 'viem/chains';
import { getRedis } from '@/lib/server/redis';
import { findAwakening } from '@/lib/server/awakened';
import { BOOA_ETH_ADDRESS } from '@/lib/contracts/booa-eth';
import { getAdapterAddress, BOOA_ADAPTER_ABI } from '@/lib/contracts/booa-adapter';

export const BOOA_SUPPLY = 3333;
export const ORIGINAL_RENDERER = '0x7Cf376EE7263a78Db2d163775BE322fA7B842C76' as const;
const ZERO = '0x0000000000000000000000000000000000000000';

const ABI = parseAbi([
  'function tokenURI(uint256 tokenId) view returns (string)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function renderer() view returns (address)',
]);

const alchemy = process.env.ALCHEMY_API_KEY;
const client = createPublicClient({
  chain: mainnet,
  batch: { multicall: true },
  transport: fallback([
    ...(alchemy ? [http(`https://eth-mainnet.g.alchemy.com/v2/${alchemy}`, { timeout: 10_000 })] : []),
    http('https://ethereum-rpc.publicnode.com', { timeout: 10_000 }),
  ]),
});

export interface BooaTrait { trait_type: string; value: string }
export interface BooaMint { name: string; attributes: BooaTrait[] }
export interface BooaCurrent extends BooaMint { owner: string | null; home: 'ethereum' | 'shape' }
export interface BooaAgentLink {
  agentId: number;
  awakenedBy: string;
  awakenedAt: number | null;
  agentWallet: string | null;
  walletSetBy: string | null;
}

export function walletStale(link: { agentWallet: string | null; walletSetBy: string | null }, owner: string | null): boolean {
  return !!(link.agentWallet && link.walletSetBy && owner && link.walletSetBy !== owner.toLowerCase());
}

export function isTokenId(id: number): boolean {
  return Number.isInteger(id) && id >= 0 && id < BOOA_SUPPLY;
}

export function caipRef(id: number): string {
  return `eip155:1/erc721:${BOOA_ETH_ADDRESS}/${id}`;
}

function decode(uri: string): { name: string; description: string; attributes: BooaTrait[]; svg: string } {
  const json = JSON.parse(Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64').toString('utf8'));
  const image: string = json.image || '';
  const body = image.slice(image.indexOf(',') + 1);
  const svg = image.includes(';base64,') ? Buffer.from(body, 'base64').toString('utf8') : decodeURIComponent(body);
  return { name: json.name || '', description: json.description || '', attributes: json.attributes || [], svg };
}

async function cached<T>(key: string, ttl: number | null, load: () => Promise<T>): Promise<T> {
  const redis = getRedis();
  const hit = await redis.get<{ v: T }>(key).catch(() => null);
  if (hit) return hit.v;
  const v = await load();
  await (ttl ? redis.set(key, { v }, { ex: ttl }) : redis.set(key, { v })).catch(() => null);
  return v;
}

async function liveRenderer(): Promise<`0x${string}`> {
  return cached('booa:v1:renderer', 600, () =>
    client.readContract({ address: BOOA_ETH_ADDRESS, abi: ABI, functionName: 'renderer' }),
  );
}

export async function readArt(id: number, variant: 'live' | 'original') {
  const renderer = variant === 'live' ? await liveRenderer() : ORIGINAL_RENDERER;
  const uri = await client.readContract({ address: renderer, abi: ABI, functionName: 'tokenURI', args: [BigInt(id)] });
  return decode(uri);
}

export async function getBooaMint(id: number): Promise<BooaMint> {
  return cached(`booa:v1:mint:${id}`, null, async () => {
    const { name, attributes } = await readArt(id, 'original');
    return { name, attributes };
  });
}

export async function getBooaCurrent(id: number): Promise<BooaCurrent> {
  return cached(`booa:v1:current:${id}`, 300, async () => {
    const [art, owner] = await Promise.all([
      readArt(id, 'live'),
      client.readContract({ address: BOOA_ETH_ADDRESS, abi: ABI, functionName: 'ownerOf', args: [BigInt(id)] })
        .then((o) => o.toLowerCase())
        .catch(() => null),
    ]);
    return { name: art.name, attributes: art.attributes, owner, home: owner ? 'ethereum' : 'shape' };
  });
}

export async function getBooaAgent(id: number): Promise<BooaAgentLink | null> {
  return cached(`booa:v1:agent:${id}`, 120, async () => {
    const awakening = await findAwakening(mainnet.id, id);
    if (!awakening) return null;
    const adapter = getAdapterAddress(mainnet.id);
    const wallet = adapter
      ? await client.readContract({
          address: adapter, abi: BOOA_ADAPTER_ABI, functionName: 'getAgentWallet', args: [BigInt(awakening.agentId)],
        }).catch(() => null) as string | null
      : null;
    return {
      agentId: awakening.agentId,
      awakenedBy: awakening.awakenedBy.toLowerCase(),
      awakenedAt: awakening.awakenedAt,
      agentWallet: wallet && wallet.toLowerCase() !== ZERO ? wallet.toLowerCase() : null,
      walletSetBy: awakening.walletSetBy ?? null,
    };
  });
}

export async function purgeBooa(id: number): Promise<void> {
  await getRedis().del(`booa:v1:current:${id}`, `booa:v1:agent:${id}`).catch(() => null);
}
