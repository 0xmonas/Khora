'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ExternalLink, Download, FileCode, Image as ImageIcon, Archive, FileText, X, Search } from 'lucide-react';
import { useChainId, useReadContract } from 'wagmi';
import { base } from 'wagmi/chains';
import { GalleryThumbnail } from './GalleryThumbnail';
import { useGalleryTokens, type GalleryToken } from '@/hooks/useGalleryTokens';
import { useAgentMetadata } from '@/hooks/useAgentMetadata';
import { useGenerator } from '@/components/features/generator/GeneratorContext';
import { CustomScrollArea } from '@/components/ui/custom-scroll-area';
import { BOOA_NFT_ABI, getContractAddress } from '@/lib/contracts/booa';
import type { KhoraAgent } from '@/types/agent';

interface OnChainTrait {
  trait_type: string;
  value: string;
}

function useOnChainTraits(tokenId: bigint, contractAddress: `0x${string}`) {
  const { data } = useReadContract({
    address: contractAddress,
    abi: BOOA_NFT_ABI,
    functionName: 'getTraits',
    args: [tokenId],
    query: { enabled: !!contractAddress },
  });

  if (!data) return [];
  try {
    return JSON.parse(data as string) as OnChainTrait[];
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

// Build a KhoraAgent-like object from on-chain traits for downloads
function traitsToAgent(traits: OnChainTrait[]): KhoraAgent {
  const get = (type: string) => traits.find(t => t.trait_type === type)?.value || '';
  const getAll = (type: string) => traits.filter(t => t.trait_type === type).map(t => t.value);
  return {
    name: get('Name') || 'Agent',
    description: get('Description'),
    creature: get('Creature'),
    vibe: get('Vibe'),
    emoji: get('Emoji'),
    personality: getAll('Personality'),
    boundaries: getAll('Boundary'),
    skills: getAll('Skill'),
    domains: getAll('Domain'),
    services: [],
    image: '',
  };
}

async function downloadFormat(
  agent: KhoraAgent,
  svgString: string | null,
  format: 'json' | 'openclaw' | 'png' | 'svg',
) {
  const fileName = agent.name.toLowerCase().replace(/\s+/g, '-') || 'agent';

  if (format === 'json') {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { image: _img, ...dataWithoutImage } = agent;
    const blob = new Blob([JSON.stringify(dataWithoutImage, null, 2)], { type: 'application/json' });
    downloadBlob(blob, `${fileName}.json`);
  } else if (format === 'openclaw') {
    const { toOpenClawZip } = await import('@/utils/helpers/exportFormats');
    const zipBlob = await toOpenClawZip(agent);
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
  const contract = getContractAddress(chainId);
  const isMainnet = chainId === base.id;
  const tokenId = token.tokenId.toString();
  const traits = useOnChainTraits(token.tokenId, contract);
  // Only fetch full metadata (Upstash) for owned tokens
  const { metadata, isLoading: metadataLoading } = useAgentMetadata(token.isOwned ? token.tokenId : null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  // Close lightbox on Escape
  useEffect(() => {
    if (!lightboxOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [lightboxOpen]);

  const marketplaceUrl = isMainnet
    ? `https://opensea.io/assets/base/${contract}/${tokenId}`
    : `https://testnet.rarible.com/token/base/${contract}:${tokenId}`;

  const chainSlug = isMainnet ? 'base' : 'base-sepolia';
  const onchainCheckerUrl = `https://onchainchecker.xyz/collection/${chainSlug}/${contract}/${tokenId}`;

  // Extract key traits from on-chain data (public for everyone)
  const name = traits.find(t => t.trait_type === 'Name')?.value;
  const description = traits.find(t => t.trait_type === 'Description')?.value;
  const creature = traits.find(t => t.trait_type === 'Creature')?.value;
  const vibe = traits.find(t => t.trait_type === 'Vibe')?.value;
  const emoji = traits.find(t => t.trait_type === 'Emoji')?.value;
  const skills = traits.filter(t => t.trait_type === 'Skill').map(t => t.value);
  const domains = traits.filter(t => t.trait_type === 'Domain').map(t => t.value);

  const iconBtn = 'w-8 h-8 border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors';

  return (
    <>
    <CustomScrollArea className="h-full">
      <div className="p-3 space-y-3">
        {/* Header: image + info */}
        <div className="flex gap-3 items-start">
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

          <div className="flex-1 min-w-0 flex flex-col justify-between h-24">
            <div className="space-y-0.5">
              <p className="font-mono text-xs font-bold text-neutral-900 dark:text-white truncate">
                {emoji && `${emoji} `}{name || `Agent #${tokenId}`}
              </p>
              {creature && (
                <p className="font-mono text-[10px] text-neutral-500 truncate">
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
                title={isMainnet ? 'OpenSea' : 'Rarible'}
              >
                <ExternalLink className="w-3.5 h-3.5 dark:text-white" />
              </a>
              <a
                href={onchainCheckerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={iconBtn}
                title="OnchainChecker"
              >
                <FileText className="w-3.5 h-3.5 dark:text-white" />
              </a>
            </div>
          </div>
        </div>

        {/* Description */}
        {description && (
          <div>
            <p className="font-mono text-[10px] text-neutral-400 uppercase mb-1">description</p>
            <p className="font-mono text-[11px] text-neutral-700 dark:text-neutral-300 leading-relaxed">
              {description}
            </p>
          </div>
        )}

        {/* Traits: skills & domains */}
        {(skills.length > 0 || domains.length > 0) && (
          <div className="space-y-2">
            {skills.length > 0 && (
              <div>
                <p className="font-mono text-[10px] text-neutral-400 uppercase mb-1">skills</p>
                <div className="flex flex-wrap gap-1">
                  {skills.map((s) => (
                    <span
                      key={s}
                      className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 font-mono text-[10px] text-neutral-600 dark:text-neutral-400"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {domains.length > 0 && (
              <div>
                <p className="font-mono text-[10px] text-neutral-400 uppercase mb-1">domains</p>
                <div className="flex flex-wrap gap-1">
                  {domains.map((d) => (
                    <span
                      key={d}
                      className="px-1.5 py-0.5 bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 font-mono text-[10px] text-neutral-600 dark:text-neutral-400"
                    >
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Download row */}
        {token.isOwned && metadataLoading && (
          <div className="h-8 bg-neutral-200 dark:bg-neutral-800 animate-pulse" />
        )}
        {traits.length > 0 && (
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
                onClick={() => downloadFormat(metadata || traitsToAgent(traits), token.svg, 'openclaw')}
                className={iconBtn}
                title="OpenClaw ZIP"
              >
                <Archive className="w-3.5 h-3.5 dark:text-white" />
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
  const { tokens, isLoading, totalSupply, refetch } = useGalleryTokens();
  const { currentStep } = useGenerator();
  const [selectedToken, setSelectedToken] = useState<GalleryToken | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'newest' | 'oldest' | 'mine'>('newest');

  // Refetch when a new token is minted
  useEffect(() => {
    if (currentStep === 'complete') {
      refetch();
    }
  }, [currentStep, refetch]);

  const filteredTokens = useMemo(() => {
    let result = [...tokens];

    if (searchQuery.trim()) {
      result = result.filter(t =>
        t.tokenId.toString().includes(searchQuery.trim())
      );
    }

    if (filter === 'mine') {
      result = result.filter(t => t.isOwned);
    }

    if (filter === 'oldest') {
      result.sort((a, b) => Number(a.tokenId - b.tokenId));
    } else {
      // newest and mine both sort newest first
      result.sort((a, b) => Number(b.tokenId - a.tokenId));
    }

    return result;
  }, [tokens, searchQuery, filter]);

  const hasActiveFilter = searchQuery.trim() || filter === 'mine';

  return (
    <div
      className="border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 overflow-hidden w-full aspect-square"
    >
      {/* Title bar */}
      <div className="h-10 border-b-2 border-neutral-700 dark:border-neutral-200 p-2 flex justify-between items-center">
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
        <div className="h-[calc(100%-40px)]">
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
                placeholder="search by id..."
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
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-3">
                {filteredTokens.map((token) => (
                  <GalleryThumbnail
                    key={token.tokenId.toString()}
                    tokenId={token.tokenId}
                    svg={token.svg}
                    isOwned={token.isOwned}
                    onClick={() => setSelectedToken(token)}
                  />
                ))}
              </div>
            )}
          </CustomScrollArea>
        </div>
      )}
    </div>
  );
}
