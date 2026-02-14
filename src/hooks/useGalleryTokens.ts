'use client';

import { useCallback } from 'react';
import {
  useReadContract,
  useReadContracts,
  useAccount,
  useChainId,
} from 'wagmi';
import { useQueryClient } from '@tanstack/react-query';
import { BOOA_NFT_ABI, getContractAddress, getContractChainId } from '@/lib/contracts/booa';

export interface GalleryToken {
  tokenId: bigint;
  svg: string | null;
  isOwned: boolean;
}

export function useGalleryTokens() {
  const { address } = useAccount();
  const chainId = useChainId();
  const contractAddress = getContractAddress(chainId);
  const targetChainId = getContractChainId(chainId);
  const enabled = !!contractAddress && contractAddress.length > 2;

  // Step 1: Total supply
  const { data: totalSupply, refetch: refetchSupply } = useReadContract({
    address: contractAddress,
    abi: BOOA_NFT_ABI,
    functionName: 'totalSupply',
    chainId: targetChainId,
    query: { enabled },
  });

  // Step 2: User's balance
  const { data: userBalance } = useReadContract({
    address: contractAddress,
    abi: BOOA_NFT_ABI,
    functionName: 'balanceOf',
    args: [address!],
    chainId: targetChainId,
    query: { enabled: enabled && !!address },
  });

  // Step 3: Batch fetch all token IDs
  const count = totalSupply ? Number(totalSupply) : 0;
  const tokenIndexCalls = Array.from({ length: count }, (_, i) => ({
    address: contractAddress,
    abi: BOOA_NFT_ABI,
    functionName: 'tokenByIndex' as const,
    args: [BigInt(i)] as const,
    chainId: targetChainId,
  }));

  const { data: tokenIdResults } = useReadContracts({
    contracts: tokenIndexCalls,
    query: { enabled: count > 0 },
  });

  // Step 4: Batch fetch user's owned token IDs
  const userCount = userBalance ? Number(userBalance) : 0;
  const userTokenCalls = address
    ? Array.from({ length: userCount }, (_, i) => ({
        address: contractAddress,
        abi: BOOA_NFT_ABI,
        functionName: 'tokenOfOwnerByIndex' as const,
        args: [address, BigInt(i)] as const,
        chainId: targetChainId,
      }))
    : [];

  const { data: userTokenResults } = useReadContracts({
    contracts: userTokenCalls,
    query: { enabled: userTokenCalls.length > 0 },
  });

  // Build set of owned token IDs
  const ownedTokenIds = new Set<string>();
  userTokenResults?.forEach((result) => {
    if (result.status === 'success') {
      ownedTokenIds.add((result.result as bigint).toString());
    }
  });

  // Collect all token IDs
  const allTokenIds: bigint[] = [];
  tokenIdResults?.forEach((result) => {
    if (result.status === 'success') {
      allTokenIds.push(result.result as bigint);
    }
  });

  // Step 5: Batch fetch SVGs
  const svgCalls = allTokenIds.map((tokenId) => ({
    address: contractAddress,
    abi: BOOA_NFT_ABI,
    functionName: 'getSVG' as const,
    args: [tokenId] as const,
    chainId: targetChainId,
  }));

  const { data: svgResults, isLoading: svgsLoading } = useReadContracts({
    contracts: svgCalls,
    query: { enabled: svgCalls.length > 0 },
  });

  // Assemble token list
  const tokens: GalleryToken[] = allTokenIds.map((tokenId, i) => ({
    tokenId,
    svg: svgResults?.[i]?.status === 'success'
      ? (svgResults[i].result as string)
      : null,
    isOwned: ownedTokenIds.has(tokenId.toString()),
  }));

  const isLoading = enabled && count > 0 && (!tokenIdResults || svgsLoading);

  const queryClient = useQueryClient();

  const refetchAll = useCallback(async () => {
    // Force refetch totalSupply first so count updates
    await refetchSupply();
    // Remove stale cache + force refetch all contract queries
    // (tokenByIndex, balanceOf, tokenOfOwnerByIndex, getSVG)
    await queryClient.invalidateQueries({
      predicate: (query) => {
        const key = JSON.stringify(query.queryKey, (_k, v) =>
          typeof v === 'bigint' ? v.toString() : v,
        );
        return key.includes(contractAddress);
      },
      refetchType: 'all',
    });
    // Also reset query state to force fresh fetch (bypasses staleTime)
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
