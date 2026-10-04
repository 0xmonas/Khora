import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, isAddress, getAddress } from 'viem';
import { mainnet } from 'viem/chains';
import { getBooaEthAddress } from '@/lib/contracts/booa-eth';
import { getRedis } from '@/lib/server/redis';
import { writeLimiter, getIP } from '@/lib/ratelimit';

export const maxDuration = 15;

const OWNER_OF_ABI = [
  { type: 'function', name: 'ownerOf', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'address' }] },
] as const;
const COOLDOWN_SECONDS = 45;
const UPSTREAM_TIMEOUT_MS = 8000;

export async function POST(req: NextRequest, { params }: { params: Promise<{ tokenId: string }> }) {
  const address = req.headers.get('x-siwe-address');
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  }

  const { tokenId } = await params;
  const id = Number(tokenId);
  if (!/^\d{1,4}$/.test(tokenId) || id >= 3333) {
    return NextResponse.json({ error: 'Invalid tokenId' }, { status: 400 });
  }

  const rl = await writeLimiter.limit(`refresh:${getIP(req)}`);
  if (!rl.success) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const booa = getBooaEthAddress();
  const alchemyKey = process.env.ALCHEMY_API_KEY;
  if (!booa || !alchemyKey) {
    return NextResponse.json({ error: 'Not configured' }, { status: 503 });
  }

  const client = createPublicClient({ chain: mainnet, transport: http(`https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`) });
  const owner = await client
    .readContract({ address: booa, abi: OWNER_OF_ABI, functionName: 'ownerOf', args: [BigInt(id)] })
    .catch(() => null);
  if (!owner || getAddress(owner) !== getAddress(address)) {
    return NextResponse.json({ error: 'Holder only.' }, { status: 403 });
  }

  const gate = await getRedis().set(`refresh:v1:${id}`, address, { nx: true, ex: COOLDOWN_SECONDS });
  if (!gate) {
    return NextResponse.json({ error: 'Refreshed recently. Try again in a few minutes.' }, { status: 429 });
  }

  const openseaKey = process.env.OPENSEA_API_KEY;
  const [alchemy, opensea] = await Promise.all([
    fetch(
      `https://eth-mainnet.g.alchemy.com/nft/v3/${alchemyKey}/getNFTMetadata?contractAddress=${booa}&tokenId=${id}&refreshCache=true`,
      { signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) },
    ).then((r) => r.ok).catch(() => false),
    openseaKey
      ? fetch(`https://api.opensea.io/api/v2/chain/ethereum/contract/${booa}/nfts/${id}/refresh`, {
          method: 'POST',
          headers: { 'x-api-key': openseaKey },
          signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
        }).then((r) => r.ok).catch(() => false)
      : Promise.resolve(false),
  ]);

  return NextResponse.json({ tokenId: id, alchemy, opensea });
}
