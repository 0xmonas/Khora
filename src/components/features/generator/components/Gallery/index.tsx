'use client';

import { useEffect } from 'react';
import { GalleryThumbnail } from './GalleryThumbnail';
import { useGalleryTokens } from '@/hooks/useGalleryTokens';
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
  const { tokens, isLoading, totalSupply, refetch } = useGalleryTokens();
  const { currentStep } = useGenerator();

  // Refetch when a new token is minted
  useEffect(() => {
    if (currentStep === 'complete') {
      refetch();
    }
  }, [currentStep, refetch]);

  return (
    <div
      className="border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 overflow-hidden w-full aspect-square"
    >
      {/* Title bar */}
      <div className="h-10 border-b-2 border-neutral-700 dark:border-neutral-200 p-2 flex justify-between items-center">
        <span className="text-sm font-mono tracking-tight dark:text-white">
          collection ({totalSupply})
        </span>
      </div>

      {/* Content */}
      <CustomScrollArea className="h-[calc(100%-40px)]">
        {isLoading ? (
          <GallerySkeleton />
        ) : tokens.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[200px]">
            <p className="font-mono text-sm text-neutral-500">No agents minted yet</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 p-3">
            {tokens.map((token) => (
              <GalleryThumbnail
                key={token.tokenId.toString()}
                tokenId={token.tokenId}
                svg={token.svg}
                isOwned={token.isOwned}
              />
            ))}
          </div>
        )}
      </CustomScrollArea>
    </div>
  );
}
