'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useAccount } from 'wagmi';
import { useBridge } from '../BridgeContext';
import { NFTCard } from './NFTCard';
import type { NFTItem } from '@/app/api/fetch-nfts/route';
import type { DiscoveredAgent } from '@/types/agent';

const CHAIN_IDS: Record<string, number> = {
  base: 8453, 'base-sepolia': 84532, ethereum: 1, polygon: 137, arbitrum: 42161,
  celo: 42220, gnosis: 100, scroll: 534352, taiko: 167000, bsc: 56,
};

const CHAIN_OPTIONS = [
  { value: 'base', label: 'Base' },
  { value: 'base-sepolia', label: 'Base Sepolia' },
  { value: 'ethereum', label: 'Ethereum' },
  { value: 'polygon', label: 'Polygon' },
  { value: 'arbitrum', label: 'Arbitrum' },
] as const;

type Tab = 'nfts' | 'agents';

function agentToNFTItem(agent: DiscoveredAgent): NFTItem {
  let image = agent.image || '';
  if (image.startsWith('ipfs://')) {
    image = `https://ipfs.io/ipfs/${image.slice(7)}`;
  }
  return {
    contractAddress: '0x8004',
    tokenId: agent.tokenId.toString(),
    name: agent.name || `Agent #${agent.tokenId}`,
    description: agent.description || '',
    image,
    collection: `8004 · ${agent.chainName}`,
    tokenType: 'ERC721',
    chain: agent.chain,
    chainId: CHAIN_IDS[agent.chain] || 0,
    raw: { attributes: [] },
  };
}

export function NFTGrid() {
  const {
    nfts, loading, loadMore, hasMore,
    selectedChain, setSelectedChain,
    selectedNFT, selectNFT,
  } = useBridge();

  const { address, isConnected } = useAccount();

  const [tab, setTab] = useState<Tab>('nfts');
  const [agents, setAgents] = useState<DiscoveredAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);

  // Fetch agents only for the selected chain
  useEffect(() => {
    if (!isConnected || !address) { setAgents([]); return; }
    setAgentsLoading(true);
    setAgents([]);
    fetch(`/api/discover-agents?address=${address}&chain=${selectedChain}`)
      .then((res) => res.json())
      .then((data) => setAgents(data.agents || []))
      .catch(() => setAgents([]))
      .finally(() => setAgentsLoading(false));
  }, [isConnected, address, selectedChain]);

  const agentItems = useMemo(() => agents.map(agentToNFTItem), [agents]);

  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (tab !== 'nfts' || !hasMore || loading) return;
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [tab, hasMore, loading, loadMore]);

  const isLoading = tab === 'nfts' ? loading : agentsLoading;
  const items = tab === 'nfts' ? nfts : agentItems;
  const isEmpty = !isLoading && items.length === 0;
  const chainLabel = CHAIN_OPTIONS.find(c => c.value === selectedChain)?.label || selectedChain;

  return (
    <div className="space-y-3">
      {/* Tab toggle + chain filter */}
      <div className="flex items-center justify-between">
        <div className="flex">
          <button
            type="button"
            onClick={() => setTab('nfts')}
            className={`px-4 py-2 border-2 border-neutral-700 dark:border-neutral-200 font-mono text-xs transition-colors ${
              tab === 'nfts'
                ? 'bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900'
                : 'bg-white dark:bg-neutral-900 dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5'
            }`}
          >
            NFTs
          </button>
          <button
            type="button"
            onClick={() => setTab('agents')}
            className={`px-4 py-2 border-2 border-l-0 border-neutral-700 dark:border-neutral-200 font-mono text-xs transition-colors ${
              tab === 'agents'
                ? 'bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900'
                : 'bg-white dark:bg-neutral-900 dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5'
            }`}
          >
            Agents
          </button>
        </div>
        <div className="w-32">
          <select
            value={selectedChain}
            onChange={(e) => setSelectedChain(e.target.value as typeof selectedChain)}
            className="w-full p-1.5 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-[10px] cursor-pointer outline-none"
          >
            {CHAIN_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Grid */}
      {items.length > 0 && (
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-1.5">
          {items.map((nft) => (
            <NFTCard
              key={`${tab}:${nft.chain}:${nft.contractAddress}:${nft.tokenId}`}
              nft={nft}
              isSelected={
                selectedNFT?.contractAddress === nft.contractAddress &&
                selectedNFT?.tokenId === nft.tokenId
              }
              onClick={() => selectNFT(nft)}
              badge={tab === 'agents' ? '8004' : undefined}
            />
          ))}
        </div>
      )}

      {/* Loading skeletons */}
      {isLoading && (
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-1.5">
          {Array.from({ length: 14 }).map((_, i) => (
            <div key={i} className="border border-neutral-200 dark:border-neutral-700">
              <div className="aspect-square bg-neutral-100 dark:bg-neutral-800 animate-pulse" />
              <div className="p-1.5 space-y-0.5">
                <div className="h-2 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse w-2/3" />
                <div className="h-2.5 bg-neutral-200 dark:bg-neutral-700 rounded animate-pulse w-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="flex items-center justify-center py-12">
          <p className="font-mono text-xs text-neutral-400">
            {tab === 'nfts'
              ? `No NFTs found on ${chainLabel}`
              : `No registered agents on ${chainLabel}`
            }
          </p>
        </div>
      )}

      {/* Infinite scroll sentinel (NFTs tab only) */}
      {tab === 'nfts' && hasMore && <div ref={sentinelRef} className="h-4" />}
    </div>
  );
}
