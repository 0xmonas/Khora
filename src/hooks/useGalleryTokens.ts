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
 * When filter is 'mine', fetches owned tokens via /api/gallery/owned instead.
 */
export function useGalleryTokens(filter: 'newest' | 'oldest' | 'mine' = 'newest') {
  const { address } = useAccount();
  const chainId = useChainId();
  const contractAddress = getV2Address(chainId);
  const targetChainId = getV2ChainId(chainId);
  const enabled = !!contractAddress && contractAddress.length > 2;

  const [galleryData, setGalleryData] = useState<{ tokenId: string; svg: string | null }[]>([]);
  const [ownedData, setOwnedData] = useState<{ tokenId: string; svg: string | null }[]>([]);
  const [ownedLoading, setOwnedLoading] = useState(false);
  const [ownedFetched, setOwnedFetched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const nextTokenRef = useRef<string | undefined>(undefined);
  const fetchedRef = useRef(false);

  const chain = chainId === shape.id ? 'shape' : 'shape-sepolia';

  // Fetch one page of collection tokens
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

  // Fetch owned tokens via Alchemy getNFTsForOwner
  const fetchOwned = useCallback(async () => {
    if (!enabled || !address || ownedLoading) return;
    setOwnedLoading(true);
    try {
      const url = new URL('/api/gallery/owned', window.location.origin);
      url.searchParams.set('contract', contractAddress);
      url.searchParams.set('chain', chain);
      url.searchParams.set('owner', address);

      const res = await fetch(url.toString());
      if (!res.ok) return;

      const data = await res.json();
      setOwnedData((data.tokens || []).map((t: { tokenId: string; svg: string | null }) => ({
        tokenId: t.tokenId,
        svg: t.svg || null,
      })));
      setOwnedFetched(true);
    } catch {
      // Keep existing data on error
    } finally {
      setOwnedLoading(false);
    }
  }, [enabled, contractAddress, chain, address, ownedLoading]);

  // Initial collection fetch
  useEffect(() => {
    if (!fetchedRef.current && enabled) {
      fetchedRef.current = true;
      fetchPage(true);
    }
  }, [enabled, fetchPage]);

  // Fetch owned tokens when 'mine' filter is selected
  useEffect(() => {
    if (filter === 'mine' && !ownedFetched && address) {
      fetchOwned();
    }
  }, [filter, ownedFetched, address, fetchOwned]);

  // Load more (called by UI on scroll/button)
  const loadMore = useCallback(() => {
    if (hasMore && !isLoading) fetchPage(false);
  }, [hasMore, isLoading, fetchPage]);

  // On-chain ownerOf batch — only for currently loaded collection tokens
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

  // Build ownership set from on-chain data (for collection view)
  const ownedSet = new Set<string>();
  if (address && ownerResults) {
    ownerResults.forEach((result, i) => {
      if (result.status === 'success' && (result.result as string).toLowerCase() === address.toLowerCase()) {
        ownedSet.add(allTokenIds[i].toString());
      }
    });
  }
  // Also add owned tokens from Alchemy owned endpoint
  if (ownedData.length > 0) {
    ownedData.forEach(t => ownedSet.add(t.tokenId));
  }

  // When filter is 'mine', return owned tokens directly from Alchemy
  const tokens: GalleryToken[] = filter === 'mine'
    ? ownedData.map((t) => ({
        tokenId: BigInt(t.tokenId),
        svg: t.svg,
        isOwned: true,
      }))
    : galleryData.map((t) => ({
        tokenId: BigInt(t.tokenId),
        svg: t.svg,
        isOwned: ownedSet.has(t.tokenId),
      }));

  const refetch = useCallback(async () => {
    fetchedRef.current = false;
    nextTokenRef.current = undefined;
    setHasMore(true);
    setGalleryData([]);
    setOwnedData([]);
    setOwnedFetched(false);
    await fetchPage(true);
  }, [fetchPage]);

  return {
    tokens,
    totalSupply: galleryData.length,
    isLoading: filter === 'mine' ? ownedLoading : isLoading,
    hasMore: filter === 'mine' ? false : hasMore,
    loadMore,
    refetch,
  };
}
