'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useChainId, useReadContracts } from 'wagmi';
import { BOOA_V2_ABI, getV2Address, getV2ChainId } from '@/lib/contracts/booa-v2';
import { shape } from 'wagmi/chains';

const PAGE_SIZE = 50;

export interface GalleryToken {
  tokenId: bigint;
  svg: string | null;
  isOwned: boolean;
}

/**
 * Fetches gallery tokens with pagination (50 per page).
 * Uses /api/gallery (Alchemy) for metadata + on-chain ownerOf for ownership.
 */
export function useGalleryTokens() {
  const { address } = useAccount();
  const chainId = useChainId();
  const contractAddress = getV2Address(chainId);
  const targetChainId = getV2ChainId(chainId);
  const enabled = !!contractAddress && contractAddress.length > 2;

  const [galleryData, setGalleryData] = useState<{ tokenId: string; svg: string | null }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const nextTokenRef = useRef<string | undefined>(undefined);
  const fetchedRef = useRef(false);

  const chain = chainId === shape.id ? 'shape' : 'shape-sepolia';

  // Fetch one page of tokens
  const fetchPage = useCallback(async (isInitial = false) => {
    if (!enabled || isLoading) return;
    if (!isInitial && !hasMore) return;

    setIsLoading(true);
    try {
      const url = new URL('/api/gallery', window.location.origin);
      url.searchParams.set('contract', contractAddress);
      url.searchParams.set('chain', chain);
      url.searchParams.set('limit', String(PAGE_SIZE));
      if (!isInitial && nextTokenRef.current) {
        url.searchParams.set('startToken', nextTokenRef.current);
      }

      const res = await fetch(url.toString());
      if (!res.ok) return;

      const data = await res.json();
      const newTokens = (data.tokens || []).map((t: { tokenId: string; svg: string | null }) => ({
        tokenId: t.tokenId,
        svg: t.svg || null,
      }));

      if (isInitial) {
        setGalleryData(newTokens);
      } else {
        setGalleryData(prev => [...prev, ...newTokens]);
      }

      nextTokenRef.current = data.nextToken || undefined;
      setHasMore(!!data.nextToken);
    } catch {
      // Keep existing data on error
    } finally {
      setIsLoading(false);
    }
  }, [enabled, contractAddress, chain, isLoading, hasMore]);

  // Initial fetch
  useEffect(() => {
    if (!fetchedRef.current && enabled) {
      fetchedRef.current = true;
      fetchPage(true);
    }
  }, [enabled, fetchPage]);

  // Load more (called by UI on scroll/button)
  const loadMore = useCallback(() => {
    if (hasMore && !isLoading) fetchPage(false);
  }, [hasMore, isLoading, fetchPage]);

  // On-chain ownerOf batch — only for currently loaded tokens
  const allTokenIds = galleryData.map((t) => BigInt(t.tokenId));

  const ownerCalls = allTokenIds.map((tokenId) => ({
    address: contractAddress,
    abi: BOOA_V2_ABI,
    functionName: 'ownerOf' as const,
    args: [tokenId] as const,
    chainId: targetChainId,
  }));

  const { data: ownerResults } = useReadContracts({
    contracts: ownerCalls,
    query: { enabled: galleryData.length > 0 && !!address },
  });

  // Build final token list with accurate ownership
  const ownedSet = new Set<string>();
  if (address && ownerResults) {
    ownerResults.forEach((result, i) => {
      if (result.status === 'success' && (result.result as string).toLowerCase() === address.toLowerCase()) {
        ownedSet.add(allTokenIds[i].toString());
      }
    });
  }

  const tokens: GalleryToken[] = galleryData.map((t) => ({
    tokenId: BigInt(t.tokenId),
    svg: t.svg,
    isOwned: ownedSet.has(t.tokenId),
  }));

  const refetch = useCallback(async () => {
    fetchedRef.current = false;
    nextTokenRef.current = undefined;
    setHasMore(true);
    setGalleryData([]);
    await fetchPage(true);
  }, [fetchPage]);

  return {
    tokens,
    totalSupply: galleryData.length,
    isLoading,
    hasMore,
    loadMore,
    refetch,
  };
}
