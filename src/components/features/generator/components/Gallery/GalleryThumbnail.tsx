'use client';

import { useState } from 'react';
import { booaImageUrl } from '@/hooks/useGalleryTokens';

interface GalleryThumbnailProps {
  tokenId: bigint;
  name: string;
  isOwned: boolean;
  onClick?: () => void;
}

export function GalleryThumbnail({ tokenId, name, isOwned, onClick }: GalleryThumbnailProps) {
  const [hovered, setHovered] = useState(false);
  const [failed, setFailed] = useState(false);

  const ringClass = isOwned
    ? 'ring-2 ring-green-500'
    : 'ring-1 ring-neutral-200 dark:ring-neutral-800 hover:ring-neutral-400 dark:hover:ring-neutral-600';

  return (
    <div
      className={`relative aspect-square rounded-md ${ringClass} bg-neutral-50 dark:bg-neutral-900 overflow-hidden cursor-pointer transition-all duration-150 hover:scale-[1.03]`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      {failed ? (
        <div className="w-full h-full flex items-center justify-center bg-neutral-200 dark:bg-neutral-700 font-mono text-[9px] text-neutral-500">#{tokenId.toString()}</div>
      ) : (
        <img
          src={booaImageUrl(tokenId)}
          alt={`Token #${tokenId.toString()}`}
          className="w-full h-full object-contain"
          style={{ imageRendering: 'pixelated' }}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      )}

      {hovered && (
        <div className="absolute inset-x-0 bottom-0 bg-black/70 px-1 py-0.5 text-center">
          <span className="text-[10px] font-mono text-white truncate block">
            #{tokenId.toString()} {name && !name.startsWith('#') ? name : ''}
          </span>
        </div>
      )}
    </div>
  );
}
