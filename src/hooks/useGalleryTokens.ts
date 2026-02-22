'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useChainId, useReadContracts } from 'wagmi';
import { BOOA_V2_ABI, getV2Address, getV2ChainId } from '@/lib/contracts/booa-v2';
import { base } from 'wagmi/chains';

export interface GalleryToken {
  tokenId: bigint;
  svg: string | null;
  isOwned: boolean;
}

/**
 * Fetches gallery tokens via /api/gallery (Alchemy getNFTsForContract) for metadata/SVG,
 * and uses on-chain ownerOf calls for accurate ownership detection.
 */
export function useGalleryTokens() {
  const { address } = useAccount();
  const chainId = useChainId();
  const contractAddress = getV2Address(chainId);
  const targetChainId = getV2ChainId(chainId);
  const enabled = !!contractAddress && contractAddress.length > 2;

  const [galleryData, setGalleryData] = useState<{ tokenId: string; svg: string | null }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const fetchedRef = useRef(false);

  const chain = chainId === base.id ? 'base' : 'base-sepolia';

  // Step 1: Fetch all tokens (metadata + SVG) via Alchemy API
  const fetchGallery = useCallback(async () => {
    if (!enabled) return;

    setIsLoading(true);
    try {
      const allTokens: { tokenId: string; svg: string | null }[] = [];
      let startToken: string | undefined;

      do {
        const url = new URL('/api/gallery', window.location.origin);
        url.searchParams.set('contract', contractAddress);
        url.searchParams.set('chain', chain);
        if (startToken) url.searchParams.set('startToken', startToken);

        const res = await fetch(url.toString());
        if (!res.ok) break;

        const data = await res.json();

        for (const token of data.tokens || []) {
          allTokens.push({
            tokenId: token.tokenId,
            svg: token.svg || null,
          });
        }

        startToken = data.nextToken || undefined;
      } while (startToken);

      setGalleryData(allTokens);
    } catch {
      // Keep existing data on error
    } finally {
      setIsLoading(false);
    }
  }, [enabled, contractAddress, chain]);

  // Initial fetch
  useEffect(() => {
    if (!fetchedRef.current && enabled) {
      fetchedRef.current = true;
      fetchGallery();
    }
  }, [enabled, fetchGallery]);

  // Step 2: On-chain ownerOf batch — this is lightweight (just address returns, not SVG data)
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
    query: { enabled: galleryData.length > 0 },
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
    await fetchGallery();
  }, [fetchGallery]);

  return {
    tokens,
    totalSupply: galleryData.length,
    isLoading: isLoading || (galleryData.length > 0 && !ownerResults),
    refetch,
  };
}
