'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, FileCode, Image as ImageIcon, X, Search } from 'lucide-react';
import Image from 'next/image';
import { useChainId, useReadContract, useAccount } from 'wagmi';
import { shape, mainnet } from 'wagmi/chains';
import { GalleryThumbnail } from './GalleryThumbnail';
import { useGalleryTokens, type GalleryToken } from '@/hooks/useGalleryTokens';
import { useAgentMetadata } from '@/hooks/useAgentMetadata';
import { useGenerator } from '@/components/features/generator/GeneratorContext';
import { CustomScrollArea } from '@/components/ui/custom-scroll-area';
import { BOOA_V2_STORAGE_ABI, getV2Address, getV2StorageAddress } from '@/lib/contracts/booa-v2';
import type { BooaAgent } from '@/types/agent';

interface OnChainTrait {
  trait_type: string;
  value: string;
}

function useOnChainTraits(tokenId: bigint, storageAddress: `0x${string}`) {
  const { data } = useReadContract({
    address: storageAddress,
    abi: BOOA_V2_STORAGE_ABI,
    functionName: 'getTraits',
    args: [tokenId],
    query: { enabled: !!storageAddress && storageAddress.length > 2 },
  });

  if (!data) return [];
  try {
    // V2 Storage returns bytes (hex string from viem) — decode to string then parse JSON
    const hex = data as `0x${string}`;
    const bytes = new Uint8Array(
      hex.slice(2).match(/.{1,2}/g)!.map(b => parseInt(b, 16))
    );
    const decoded = new TextDecoder().decode(bytes);
    return JSON.parse(decoded) as OnChainTrait[];
  } catch {
    return [];
  }
}

function GallerySkeleton() {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-3">
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          className="aspect-square bg-neutral-200 dark:bg-neutral-800 animate-pulse"
        />
      ))}
    </div>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

import { traitsToAgent } from '@/utils/helpers/exportFormats';

async function downloadFormat(
  agent: BooaAgent,
  svgString: string | null,
  format: 'json' | 'erc8004' | 'openclaw' | 'png' | 'svg',
  onChainImage?: string,
) {
  const fileName = agent.name.toLowerCase().replace(/\s+/g, '-') || 'agent';

  if (format === 'json') {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { image: _img, ...dataWithoutImage } = agent;
    const blob = new Blob([JSON.stringify(dataWithoutImage, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${fileName}.json`);
  } else if (format === 'erc8004') {
    const { toERC8004 } = await import('@/utils/helpers/exportFormats');
    const registration = toERC8004(agent);
    const blob = new Blob([JSON.stringify(registration, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${fileName}-erc8004.json`);
  } else if (format === 'openclaw') {
    const { toOpenClawZip } = await import('@/utils/helpers/exportFormats');
    const zipBlob = await toOpenClawZip(agent, onChainImage);
    downloadBlob(zipBlob, `${fileName}-openclaw.zip`);
  } else if (format === 'svg' && svgString) {
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    downloadBlob(blob, `${fileName}.svg`);
  } else if (format === 'png' && agent.image) {
    const { embedJsonInPng } = await import('@/utils/helpers/pngEncoder');
    const pngBlob = await embedJsonInPng(agent.image, agent);
    downloadBlob(pngBlob, `${fileName}.png`);
  }
}

function TokenDetail({ token }: { token: GalleryToken }) {
  const chainId = useChainId();
  const { address } = useAccount();
  const contract = getV2Address(chainId);
  const storage = getV2StorageAddress(chainId);
  const isEth = chainId === mainnet.id;
  const isMainnet = chainId === shape.id;
  const tokenId = token.tokenId.toString();
  const traits = useOnChainTraits(token.tokenId, storage);
  // Only fetch full metadata (Upstash) for owned tokens
  const { metadata, isLoading: metadataLoading } = useAgentMetadata(token.isOwned ? token.tokenId : null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const [registryAgentId, setRegistryAgentId] = useState<bigint | null>(null);

  // Fetch this token's registered 8004 agent id (for the 8004scan link).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/agent-registry/${chainId}/${token.tokenId.toString()}`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!cancelled && data?.registrations?.length > 0) {
          setRegistryAgentId(BigInt(data.registrations[0].agentId));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [chainId, token.tokenId, token.isOwned, address]);

  // Close lightbox on Escape
  useEffect(() => {
    if (!lightboxOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [lightboxOpen]);

  const marketplaceUrl = isEth
    ? `https://opensea.io/assets/ethereum/${contract}/${tokenId}`
    : isMainnet
      ? `https://opensea.io/assets/shape/${contract}/${tokenId}`
      : `https://testnet.rarible.com/token/shape/${contract}:${tokenId}`;

  const chainSlug = isEth ? 'ethereum' : isMainnet ? 'shape' : 'shape-sepolia';
  const onchainCheckerUrl = `https://onchainchecker.xyz/collection/${chainSlug}/${contract}/${tokenId}`;

  const scan8004Url = registryAgentId !== null
    ? isEth
      ? `https://www.8004scan.io/agents/ethereum/${registryAgentId.toString()}`
      : isMainnet
      ? `https://www.8004scan.io/agents/shape/${registryAgentId.toString()}`
      : `https://testnet.8004scan.io/agents/shape-sepolia/${registryAgentId.toString()}`
    : null;

  // Extract key traits from on-chain data (public for everyone)
  const name = traits.find(t => t.trait_type === 'Name')?.value;
  const description = traits.find(t => t.trait_type === 'Description')?.value;
  const creature = traits.find(t => t.trait_type === 'Creature')?.value;
  const vibe = traits.find(t => t.trait_type === 'Vibe')?.value;
  const emoji = traits.find(t => t.trait_type === 'Emoji')?.value;
  const skills = traits.filter(t => t.trait_type === 'Skill').map(t => t.value);
  const domains = traits.filter(t => t.trait_type === 'Domain').map(t => t.value);

  const iconBtn = 'w-8 h-8 flex items-center justify-center hover:opacity-60 transition-opacity';

  return (
    <>
    <CustomScrollArea className="h-full">
      <div className="p-3 space-y-3 overflow-hidden max-w-full w-full box-border">
        {/* Header: image + info */}
        <div className="flex gap-3 items-start min-w-0">
          <div
            className="w-24 h-24 flex-shrink-0 border border-neutral-300 dark:border-neutral-600 bg-neutral-100 dark:bg-neutral-800 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => token.svg && setLightboxOpen(true)}
          >
            {token.svg ? (
              <img
                src={`data:image/svg+xml,${encodeURIComponent(token.svg)}`}
                alt={`Agent #${tokenId}`}
                className="w-full h-full object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <div className="w-full h-full animate-pulse bg-neutral-200 dark:bg-neutral-700" />
            )}
          </div>

          <div className="flex-1 min-w-0 flex flex-col justify-between min-h-[96px]">
            <div className="space-y-0.5">
              <p className="font-mono text-xs font-bold text-neutral-900 dark:text-white" style={{ overflowWrap: 'anywhere' }}>
                {emoji && `${emoji} `}{name || `Agent #${tokenId}`}
              </p>
              {creature && (
                <p className="font-mono text-[10px] text-neutral-500" style={{ overflowWrap: 'anywhere' }}>
                  {creature}{vibe ? ` — ${vibe}` : ''}
                </p>
              )}
              <p className="font-mono text-[10px] text-neutral-400">
                #{tokenId}{token.isOwned && ' (owned)'}
              </p>
            </div>

            <div className="flex gap-1.5">
              <a
                href={marketplaceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={iconBtn}
                title={isEth || isMainnet ? 'OpenSea' : 'Rarible'}
              >
                <Image src="/openseatransparent.svg" alt="OpenSea" width={14} height={14} className="invert dark:invert-0" />
              </a>
              <a
                href={onchainCheckerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={iconBtn}
                title="OnchainChecker"
              >
                <Image src="/onchainchecker.svg" alt="OnchainChecker" width={14} height={14} className="dark:invert" />
              </a>
              {scan8004Url && (
                <a
                  href={scan8004Url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={iconBtn}
                  title="8004scan"
                >
                  <Image src="/8004scan.svg" alt="8004scan" width={14} height={14} className="dark:invert" />
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Description */}
        {description && (
          <div>
            <p className="font-mono text-[10px] text-neutral-400 uppercase mb-1">description</p>
            <p className="font-mono text-[11px] text-neutral-700 dark:text-neutral-300 leading-relaxed" style={{ overflowWrap: 'anywhere' }}>
              {description}
            </p>
          </div>
        )}

        {/* Traits: skills & domains */}
        <div className="space-y-2">
          <div>
            <p className="font-mono text-[10px] text-neutral-400 uppercase mb-1">skills</p>
            <div className="flex flex-wrap gap-1">
              {skills.length > 0 ? skills.map((s) => (
                <span
                  key={s}
                  className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 font-mono text-[10px] text-neutral-600 dark:text-neutral-400"
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {s}
                </span>
              )) : (
                <span className="px-1.5 py-0.5 border border-[#e8833a] font-mono text-[10px] text-[#e8833a]">None</span>
              )}
            </div>
          </div>
          <div>
            <p className="font-mono text-[10px] text-neutral-400 uppercase mb-1">domains</p>
            <div className="flex flex-wrap gap-1">
              {domains.length > 0 ? domains.map((d) => (
                <span
                  key={d}
                  className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 font-mono text-[10px] text-neutral-600 dark:text-neutral-400"
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {d}
                </span>
              )) : (
                <span className="px-1.5 py-0.5 border border-[#e8833a] font-mono text-[10px] text-[#e8833a]">None</span>
              )}
            </div>
          </div>
        </div>

        {/* Download row */}
        {token.isOwned && metadataLoading && (
          <div className="h-8 bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
        )}
        {token.isOwned && traits.length > 0 && (
          <div>
            <p className="font-mono text-[10px] text-neutral-400 uppercase mb-1">download</p>
            <div className="flex gap-1.5">
              {/* JSON & OpenClaw: use Upstash metadata if available, otherwise on-chain traits */}
              <button
                onClick={() => downloadFormat(metadata || traitsToAgent(traits), token.svg, 'json')}
                className={iconBtn}
                title="JSON"
              >
                <FileCode className="w-3.5 h-3.5 dark:text-white" />
              </button>
              <button
                onClick={() => downloadFormat(metadata || traitsToAgent(traits), token.svg, 'erc8004')}
                className={iconBtn}
                title="ERC-8004"
              >
                <span className="font-mono text-[7px] font-bold leading-none dark:text-white">8004</span>
              </button>
              <button
                onClick={() => {
                  const chainPrefix = isEth ? '1' : isMainnet ? '360' : '11011';
                  const imgRef = `eip155:${chainPrefix}/erc721:${contract}/${tokenId}`;
                  downloadFormat(metadata || traitsToAgent(traits), token.svg, 'openclaw', imgRef);
                }}
                className={iconBtn}
                title="OpenClaw ZIP"
              >
                <Image src="/openclaw.svg" alt="OpenClaw" width={14} height={14} />
              </button>
              {/* PNG only if Upstash has image */}
              {metadata?.image && (
                <button
                  onClick={() => downloadFormat(metadata, token.svg, 'png')}
                  className={iconBtn}
                  title="PNG"
                >
                  <ImageIcon className="w-3.5 h-3.5 dark:text-white" />
                </button>
              )}
              {/* SVG from on-chain — available for everyone */}
              {token.svg && (
                <button
                  onClick={() => downloadFormat(metadata || traitsToAgent(traits), token.svg, 'svg')}
                  className={iconBtn}
                  title="SVG"
                >
                  <Download className="w-3.5 h-3.5 dark:text-white" />
                </button>
              )}
            </div>
          </div>
        )}

      </div>
    </CustomScrollArea>

    {/* Lightbox */}
    {lightboxOpen && token.svg && (
      <div
        className="fixed inset-0 z-50 bg-neutral-900/95 flex items-center justify-center p-8"
        onClick={() => setLightboxOpen(false)}
      >
        <button
          onClick={() => setLightboxOpen(false)}
          className="absolute top-6 right-6 text-white hover:scale-110 transition-transform z-10"
        >
          <X className="w-8 h-8" />
        </button>
        <img
          src={`data:image/svg+xml,${encodeURIComponent(token.svg)}`}
          alt={`Agent #${tokenId}`}
          className="max-h-[85vh] max-w-[85vw] object-contain"
          style={{ imageRendering: 'pixelated' }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    )}
    </>
  );
}

export function Gallery() {
  const { currentStep } = useGenerator();
  const [selectedToken, setSelectedToken] = useState<GalleryToken | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'newest' | 'oldest' | 'mine'>('newest');
  const { tokens, isLoading, totalSupply, hasMore, loadMore, refetch } = useGalleryTokens(filter);

  // Refetch when a new token is minted — staggered to handle RPC cache delay
  useEffect(() => {
    if (currentStep === 'complete') {
      refetch();
      const t1 = setTimeout(() => refetch(), 2000);
      const t2 = setTimeout(() => refetch(), 5000);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [currentStep, refetch]);

  const filteredTokens = useMemo(() => {
    let result = [...tokens];

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter(t =>
        t.tokenId.toString().includes(q) ||
        t.name.toLowerCase().includes(q)
      );
    }

    if (filter === 'oldest') {
      result.sort((a, b) => Number(a.tokenId - b.tokenId));
    } else {
      result.sort((a, b) => Number(b.tokenId - a.tokenId));
    }

    return result;
  }, [tokens, searchQuery, filter]);

  const hasActiveFilter = searchQuery.trim() || filter === 'mine';

  return (
    <div
      className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-background shadow-sm overflow-hidden w-full h-[min(760px,calc(100vh-240px))] min-h-[480px] min-w-0 max-w-full"
    >
      {/* Title bar */}
      <div className="h-10 border-b border-neutral-100 dark:border-neutral-800 px-3 flex justify-between items-center">
        {selectedToken ? (
          <button
            onClick={() => setSelectedToken(null)}
            className="flex items-center gap-1.5 hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 px-1 -ml-1 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 dark:text-white" />
            <span className="text-sm font-mono tracking-tight dark:text-white">
              agent #{selectedToken.tokenId.toString()}
            </span>
          </button>
        ) : (
          <span className="text-sm font-mono tracking-tight dark:text-white">
            collection ({hasActiveFilter ? `${filteredTokens.length}/` : ''}{totalSupply})
          </span>
        )}
      </div>

      {/* Content */}
      {selectedToken ? (
        <div className="h-[calc(100%-40px)] min-w-0 overflow-hidden">
          <TokenDetail token={selectedToken} />
        </div>
      ) : (
        <div className="h-[calc(100%-40px)] flex flex-col">
          {/* Search & Filter bar */}
          <div className="px-3 pt-2 pb-1 flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1 min-w-0 border-b border-neutral-300 dark:border-neutral-600">
              <Search className="w-3 h-3 text-neutral-400 flex-shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="search by id or name..."
                className="w-full bg-transparent font-mono text-xs py-1 outline-none text-neutral-700 dark:text-neutral-300 placeholder:text-neutral-400"
              />
            </div>
            {(['newest', 'oldest', 'mine'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-shrink-0 px-2 py-0.5 font-mono text-[10px] border transition-colors ${
                  filter === f
                    ? 'bg-neutral-800 dark:bg-neutral-100 text-white dark:text-neutral-900 border-neutral-800 dark:border-neutral-100'
                    : 'bg-transparent text-neutral-500 dark:text-neutral-400 border-neutral-300 dark:border-neutral-600 hover:border-neutral-500'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <CustomScrollArea className="flex-1 min-h-0">
            {isLoading ? (
              <GallerySkeleton />
            ) : tokens.length === 0 ? (
              <div className="flex items-center justify-center h-full min-h-[200px]">
                <p className="font-mono text-sm text-neutral-500">No agents minted yet</p>
              </div>
            ) : filteredTokens.length === 0 ? (
              <div className="flex items-center justify-center h-full min-h-[200px]">
                <p className="font-mono text-sm text-neutral-500">No matching agents</p>
              </div>
            ) : (
              <div>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2 p-3">
                  {filteredTokens.map((token) => (
                    <GalleryThumbnail
                      key={token.tokenId.toString()}
                      tokenId={token.tokenId}
                      svg={token.svg}
                      name={token.name}
                      isOwned={token.isOwned}
                      onClick={() => setSelectedToken(token)}
                    />
                  ))}
                </div>
                {hasMore && !isLoading && (
                  <div className="flex justify-center p-3">
                    <button
                      onClick={loadMore}
                      className="px-4 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 text-xs font-mono hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                    >
                      Load More
                    </button>
                  </div>
                )}
                {isLoading && tokens.length > 0 && (
                  <p className="text-center text-xs text-neutral-500 font-mono p-3">Loading...</p>
                )}
              </div>
            )}
          </CustomScrollArea>
        </div>
      )}
    </div>
  );
}
