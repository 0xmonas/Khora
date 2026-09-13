'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { GalleryThumbnail } from './GalleryThumbnail';
import { TokenDetail } from '@/components/features/booa/TokenDetail';
import { useGalleryTokens, type GalleryToken } from '@/hooks/useGalleryTokens';
import { useGenerator } from '@/components/features/generator/GeneratorContext';
import { CustomScrollArea } from '@/components/ui/custom-scroll-area';

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

export function Gallery() {
  const { currentStep } = useGenerator();
  const [selectedToken, setSelectedToken] = useState<GalleryToken | null>(null);
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'newest' | 'oldest' | 'mine'>('newest');
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('filter') === 'mine') setFilter('mine');
  }, []);
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
          <CustomScrollArea className="h-full"><div className="p-4"><TokenDetail token={selectedToken} /></div></CustomScrollArea>
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
                      onClick={() => (token.isOwned ? router.push(`/studio/my-booas?token=${token.tokenId.toString()}`) : setSelectedToken(token))}
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
