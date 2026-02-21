'use client';

import { useCallback } from 'react';
import {
  useReadContract,
  useReadContracts,
  useAccount,
  useChainId,
} from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { BOOA_V2_ABI, getV2Address, getV2ChainId } from '@/lib/contracts/booa-v2';

export interface GalleryToken {
  tokenId: bigint;
  svg: string | null;
  isOwned: boolean;
}

// Parse SVG from tokenURI data (data:application/json;base64,... → .image → data:image/svg+xml;base64,...)
function extractSvgFromTokenURI(dataUri: string): string | null {
  try {
    if (!dataUri.startsWith('data:application/json;base64,')) return null;
    const json = atob(dataUri.replace('data:application/json;base64,', ''));
    const metadata = JSON.parse(json);
    if (metadata.image && metadata.image.startsWith('data:image/svg+xml;base64,')) {
      return atob(metadata.image.replace('data:image/svg+xml;base64,', ''));
    }
    return null;
  } catch {
    return null;
  }
}

export function useGalleryTokens() {
  const { address } = useAccount();
  const chainId = useChainId();
  const contractAddress = getV2Address(chainId);
  const targetChainId = getV2ChainId(chainId);
  const enabled = !!contractAddress && contractAddress.length > 2;

  // Step 1: Total supply
  const { data: totalSupply, refetch: refetchSupply } = useReadContract({
    address: contractAddress,
    abi: BOOA_V2_ABI,
    functionName: 'totalSupply',
    chainId: targetChainId,
    query: { enabled },
  });

  const count = totalSupply ? Number(totalSupply) : 0;

  // Step 2: V2 tokens are sequential (0..totalSupply-1) — no tokenByIndex needed
  const allTokenIds: bigint[] = Array.from({ length: count }, (_, i) => BigInt(i));

  // Step 3: Batch check ownership via ownerOf
  const ownerCalls = allTokenIds.map((tokenId) => ({
    address: contractAddress,
    abi: BOOA_V2_ABI,
    functionName: 'ownerOf' as const,
    args: [tokenId] as const,
    chainId: targetChainId,
  }));

  const { data: ownerResults } = useReadContracts({
    contracts: ownerCalls,
    query: { enabled: count > 0 },
  });

  // Build set of owned token IDs
  const ownedTokenIds = new Set<string>();
  if (address) {
    ownerResults?.forEach((result, i) => {
      if (result.status === 'success' && (result.result as string).toLowerCase() === address.toLowerCase()) {
        ownedTokenIds.add(allTokenIds[i].toString());
      }
    });
  }

  // Step 4: Batch fetch tokenURIs (SVG embedded in on-chain JSON metadata)
  const tokenURICalls = allTokenIds.map((tokenId) => ({
    address: contractAddress,
    abi: BOOA_V2_ABI,
    functionName: 'tokenURI' as const,
    args: [tokenId] as const,
    chainId: targetChainId,
  }));

  const { data: tokenURIResults, isLoading: uriLoading } = useReadContracts({
    contracts: tokenURICalls,
    query: { enabled: count > 0 },
  });

  // Assemble token list
  const tokens: GalleryToken[] = allTokenIds.map((tokenId, i) => {
    const uriResult = tokenURIResults?.[i];
    const svg = uriResult?.status === 'success'
      ? extractSvgFromTokenURI(uriResult.result as string)
      : null;

    return {
      tokenId,
      svg,
      isOwned: ownedTokenIds.has(tokenId.toString()),
    };
  });

  const isLoading = enabled && count > 0 && (!ownerResults || uriLoading);

  const queryClient = useQueryClient();

  const refetchAll = useCallback(async () => {
    await refetchSupply();
    await queryClient.invalidateQueries({
      predicate: (query) => {
        const key = JSON.stringify(query.queryKey, (_k, v) =>
          typeof v === 'bigint' ? v.toString() : v,
        );
        return key.includes(contractAddress);
      },
      refetchType: 'all',
    });
    queryClient.resetQueries({
      predicate: (query) => {
        const key = JSON.stringify(query.queryKey, (_k, v) =>
          typeof v === 'bigint' ? v.toString() : v,
        );
        return key.includes(contractAddress);
      },
    });
  }, [queryClient, contractAddress, refetchSupply]);

  return {
    tokens,
    totalSupply: count,
    isLoading,
    refetch: refetchAll,
  };
}
