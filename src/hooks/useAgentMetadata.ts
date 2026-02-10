'use client';

import { useState, useEffect } from 'react';
import { useAccount, useChainId } from 'wagmi';
import type { KhoraAgent } from '@/types/agent';

export function useAgentMetadata(tokenId: bigint | null) {
  const chainId = useChainId();
  const { address } = useAccount();
  const [metadata, setMetadata] = useState<KhoraAgent | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (tokenId === null || !address) {
      setMetadata(null);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetch(`/api/agent-metadata?chainId=${chainId}&tokenId=${tokenId.toString()}&address=${address}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.found) {
          setMetadata(data.metadata as KhoraAgent);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [chainId, tokenId, address]);

  return { metadata, isLoading };
}
