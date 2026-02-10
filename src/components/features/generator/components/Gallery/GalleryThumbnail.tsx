'use client';

import { useState } from 'react';

interface GalleryThumbnailProps {
  tokenId: bigint;
  svg: string | null;
  isOwned: boolean;
  onClick?: () => void;
}

export function GalleryThumbnail({ tokenId, svg, isOwned, onClick }: GalleryThumbnailProps) {
  const [hovered, setHovered] = useState(false);

  const borderClass = isOwned
    ? 'border-2 border-green-500'
    : 'border border-neutral-300 dark:border-neutral-700';

  return (
    <div
      className={`relative aspect-square ${borderClass} bg-neutral-100 dark:bg-neutral-800 overflow-hidden cursor-pointer transition-transform duration-150 hover:scale-[1.03]`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {svg ? (
        <img
          src={`data:image/svg+xml,${encodeURIComponent(svg)}`}
          alt={`Token #${tokenId.toString()}`}
          className="w-full h-full object-contain"
          style={{ imageRendering: 'pixelated' }}
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full bg-neutral-200 dark:bg-neutral-700 animate-pulse" />
      )}

      {hovered && (
        <div className="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-0.5 text-center">
          <span className="text-[10px] font-mono text-white">
            #{tokenId.toString()}
          </span>
        </div>
      )}
    </div>
  );
}
