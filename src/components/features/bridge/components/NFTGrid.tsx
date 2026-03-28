'use client';

import { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { useAccount } from 'wagmi';
import { useBridge } from '../BridgeContext';
import { NFTCard } from './NFTCard';
import type { NFTItem } from '@/app/api/fetch-nfts/route';
import { CHAIN_CONFIG } from '@/types/agent';
import type { DiscoveredAgent } from '@/types/agent';
import { VISIBLE_CHAIN_OPTIONS } from '@/utils/constants/chains';

const CHAIN_IDS: Record<string, number> = Object.fromEntries(
  Object.entries(CHAIN_CONFIG).map(([key, val]) => [key, val.chainId])
);

const CHAIN_OPTIONS = VISIBLE_CHAIN_OPTIONS;

const PAGE_SIZE = 20;

type Tab = 'nfts' | 'agents';
type SortOrder = 'latest' | 'oldest';

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
  const [sortOrder, setSortOrder] = useState<SortOrder>('latest');
  const [agentVisibleCount, setAgentVisibleCount] = useState(PAGE_SIZE);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch agents only for the selected chain
  useEffect(() => {
    if (!isConnected || !address) { setAgents([]); return; }
    setAgentsLoading(true);
    setAgents([]);
    setAgentVisibleCount(PAGE_SIZE);
    fetch(`/api/discover-agents?address=${address}&chain=${selectedChain}`)
      .then((res) => res.json())
      .then((data) => setAgents(data.agents || []))
      .catch(() => setAgents([]))
      .finally(() => setAgentsLoading(false));
  }, [isConnected, address, selectedChain]);

  // Sort agents by tokenId (proxy for registration order)
  const sortedAgents = useMemo(() => {
    const sorted = [...agents];
    sorted.sort((a, b) =>
      sortOrder === 'latest' ? b.tokenId - a.tokenId : a.tokenId - b.tokenId
    );
    return sorted;
  }, [agents, sortOrder]);

  // Client-side paginated agent items
  const agentItems = useMemo(
    () => sortedAgents.slice(0, agentVisibleCount).map(agentToNFTItem),
    [sortedAgents, agentVisibleCount],
  );
  const agentHasMore = agentVisibleCount < sortedAgents.length;

  const loadMoreAgents = useCallback(() => {
    setAgentVisibleCount((prev) => prev + PAGE_SIZE);
  }, []);

  // Reset visible count when sort changes
  useEffect(() => {
    setAgentVisibleCount(PAGE_SIZE);
  }, [sortOrder]);

  const sentinelRef = useRef<HTMLDivElement>(null);

  // Unified infinite scroll for both tabs
  useEffect(() => {
    const isNftsTab = tab === 'nfts';
    const shouldObserve = isNftsTab ? (hasMore && !loading) : (agentHasMore && !agentsLoading);
    if (!shouldObserve) return;

    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (isNftsTab) loadMore();
          else loadMoreAgents();
        }
      },
      { threshold: 0.1 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [tab, hasMore, loading, loadMore, agentHasMore, agentsLoading, loadMoreAgents]);

  const isLoading = tab === 'nfts' ? loading : agentsLoading;
  const rawItems = tab === 'nfts' ? nfts : agentItems;
  const items = useMemo(() => {
    if (!searchQuery.trim()) return rawItems;
    const q = searchQuery.trim().toLowerCase();
    return rawItems.filter(nft =>
      nft.tokenId.toLowerCase().includes(q) ||
      (nft.name && nft.name.toLowerCase().includes(q)) ||
      (nft.collection && nft.collection.toLowerCase().includes(q))
    );
  }, [rawItems, searchQuery]);
  const isEmpty = !isLoading && items.length === 0;
  const showSentinel = tab === 'nfts' ? hasMore : agentHasMore;
  const chainLabel = CHAIN_OPTIONS.find(c => c.value === selectedChain)?.label || selectedChain;

  return (
    <div className="space-y-3">
      {/* Tab toggle + search + sort + chain filter */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
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
          <div className="flex items-center gap-2">
            <select
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value as SortOrder)}
              className="p-1.5 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-[10px] cursor-pointer outline-none"
            >
              <option value="latest">Latest</option>
              <option value="oldest">Oldest</option>
            </select>
            <select
              value={selectedChain}
              onChange={(e) => setSelectedChain(e.target.value as typeof selectedChain)}
              className="w-32 p-1.5 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 font-mono text-[10px] cursor-pointer outline-none"
            >
              {CHAIN_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
        </div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, id, or collection..."
          className="w-full p-2 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 font-mono text-xs text-neutral-700 dark:text-neutral-300 placeholder:text-neutral-400 outline-none"
        />
      </div>

      {/* Item count */}
      {!isLoading && items.length > 0 && tab === 'agents' && (
        <p className="font-mono text-[10px] text-neutral-400">
          {agentVisibleCount >= sortedAgents.length
            ? `${sortedAgents.length} agent${sortedAgents.length !== 1 ? 's' : ''}`
            : `${agentVisibleCount} / ${sortedAgents.length} agents`
          }
        </p>
      )}

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

      {/* Infinite scroll sentinel (both tabs) */}
      {showSentinel && <div ref={sentinelRef} className="h-4" />}
    </div>
  );
}
