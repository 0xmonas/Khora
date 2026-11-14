'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAccount } from 'wagmi';
import { BOOA_ETH_ADDRESS, MIGRATION_MAX_SUPPLY } from '@/lib/contracts/booa-eth';

export type GalleryFilter = 'newest' | 'oldest' | 'mine';

export interface GalleryToken {
  tokenId: bigint;
  svg: string | null;
  name: string;
  isOwned: boolean;
}

export const booaImageUrl = (tokenId: bigint | number) => `/api/booa-image/${tokenId}`;

export function buildGallery(names: string[] | null, owned: Set<string> | null, filter: GalleryFilter): GalleryToken[] {
  const all: GalleryToken[] = Array.from({ length: MIGRATION_MAX_SUPPLY }, (_, i) => ({
    tokenId: BigInt(i),
    svg: null,
    name: names?.[i] || `#${i}`,
    isOwned: !!owned?.has(String(i)),
  }));
  return filter === 'mine' ? all.filter((t) => t.isOwned) : all;
}

export function selectGallery(tokens: GalleryToken[], filter: GalleryFilter, query: string): GalleryToken[] {
  const q = query.trim().toLowerCase();
  const hits = q ? tokens.filter((t) => t.tokenId.toString().includes(q) || t.name.toLowerCase().includes(q)) : [...tokens];
  return hits.sort((a, b) => Number(filter === 'oldest' ? a.tokenId - b.tokenId : b.tokenId - a.tokenId));
}

let namesRequest: Promise<string[] | null> | null = null;
function loadNames(): Promise<string[] | null> {
  namesRequest ??= fetch('/data/booa-names.json')
    .then((r) => (r.ok ? (r.json() as Promise<string[]>) : null), () => null)
    .then((n) => { if (!n) namesRequest = null; return n; });
  return namesRequest;
}

export function useGalleryTokens(filter: GalleryFilter = 'newest') {
  const { address } = useAccount();
  const [names, setNames] = useState<string[] | null>(null);
  const [owned, setOwned] = useState<Set<string> | null>(null);
  const [ownedError, setOwnedError] = useState(false);

  useEffect(() => {
    let alive = true;
    void loadNames().then((n) => { if (alive) setNames(n); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    setOwned(null);
    setOwnedError(false);
    if (!address) return;
    let alive = true;
    fetch(`/api/fetch-nfts?address=${address}&chain=ethereum&contract=${BOOA_ETH_ADDRESS}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`fetch-nfts ${r.status}`))))
      .then((d: { nfts?: { tokenId: string }[] }) => { if (alive) setOwned(new Set((d.nfts ?? []).map((n) => n.tokenId))); })
      .catch(() => { if (alive) setOwnedError(true); });
    return () => { alive = false; };
  }, [address]);

  const tokens = useMemo(() => buildGallery(names, owned, filter), [names, owned, filter]);

  return {
    tokens,
    totalSupply: MIGRATION_MAX_SUPPLY,
    isLoading: filter === 'mine' && !!address && !owned && !ownedError,
    connected: !!address,
    ownedError,
  };
}
