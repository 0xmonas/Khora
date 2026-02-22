'use client';

import type { NFTItem } from '@/app/api/fetch-nfts/route';

interface NFTCardProps {
  nft: NFTItem;
  isSelected: boolean;
  onClick: () => void;
  badge?: string;
}

export function NFTCard({ nft, isSelected, onClick, badge }: NFTCardProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left border transition-colors ${
        isSelected
          ? 'border-green-500 dark:border-green-400 bg-green-50 dark:bg-green-950/20'
          : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-400 dark:hover:border-neutral-500'
      }`}
    >
      <div className="aspect-square bg-neutral-100 dark:bg-neutral-800 overflow-hidden relative">
        {nft.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={nft.image}
            alt={nft.name}
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-neutral-400 font-mono text-[9px]">
            No Image
          </div>
        )}
        {badge && (
          <span className="absolute top-0.5 right-0.5 px-1 py-px bg-green-600 text-white font-mono text-[7px] uppercase tracking-wider leading-none">
            {badge}
          </span>
        )}
      </div>
      <div className="px-1.5 py-1">
        <p className="font-mono text-[9px] text-neutral-500 dark:text-neutral-400 truncate leading-tight">
          {nft.collection}
        </p>
        <p className="font-mono text-[11px] dark:text-white truncate leading-tight">
          {nft.name}
        </p>
      </div>
    </button>
  );
}
