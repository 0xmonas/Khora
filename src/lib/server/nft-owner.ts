import { createPublicClient, http, fallback } from 'viem';
import { mainnet, shape, shapeSepolia } from 'viem/chains';
import { BOOA_V2_ABI, getV2Address } from '@/lib/contracts/booa-v2';
import { isTestnetChain } from '@/lib/contracts/booa';
import { CHAIN_CONFIG } from '@/types/agent';

/**
 * Resolve the current owner of a BOOA token.
 *
 * The collection's canonical home is Ethereum; migrated tokens are burned on Shape,
 * so a mainnet lookup tries Ethereum first and falls back to Shape. `chainId` only
 * selects mainnet-vs-testnet homes — it is never used to point the read at a
 * caller-supplied contract.
 */
export async function getBooaOwner(
  tokenId: number,
  chainId: number,
): Promise<string | null> {
  if (!Number.isInteger(tokenId) || tokenId < 0) return null;

  const homes = !isTestnetChain(chainId)
    ? [
        { chain: mainnet, address: getV2Address(mainnet.id) },
        { chain: shape, address: getV2Address(shape.id) },
      ]
    : [{ chain: shapeSepolia, address: getV2Address(shapeSepolia.id) }];

  for (const { chain, address } of homes) {
    if (!address || address.length < 4) continue;
    const cfg = Object.values(CHAIN_CONFIG).find((c) => c.chainId === chain.id);
    const client = createPublicClient({
      chain,
      transport: cfg?.rpcUrls?.length ? fallback(cfg.rpcUrls.map((u: string) => http(u))) : http(),
    });
    try {
      const owner = (await client.readContract({
        address: address as `0x${string}`,
        abi: BOOA_V2_ABI,
        functionName: 'ownerOf',
        args: [BigInt(tokenId)],
      })) as string;
      return owner.toLowerCase();
    } catch { /* burned here (migrated) or RPC failed — try the next home */ }
  }
  return null;
}

/** True only when `address` provably owns the token on-chain right now. */
export async function ownsBooa(
  address: string,
  tokenId: number,
  chainId: number,
): Promise<boolean> {
  const owner = await getBooaOwner(tokenId, chainId);
  return owner !== null && owner === address.toLowerCase();
}
