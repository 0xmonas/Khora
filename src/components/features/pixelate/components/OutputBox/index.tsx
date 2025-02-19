'use client';

import React from 'react';
import { usePixelate } from '../../PixelateContext';

type OutputBoxProps = {
  title: string;
  children: React.ReactNode;
  downloadType: 'none' | 'png' | 'svg' | 'copy';
  onDownload: (type: 'png' | 'svg' | 'copy') => void;
  isDownloadDisabled: boolean;
  type: 'text' | 'image';
  onClose: () => void;
  svgSize?: string;
  pngSize?: string;
};

export const OutputBox = ({ 
  title,
  children,
  downloadType,
  onDownload,
  isDownloadDisabled,
  type,
  onClose,
  svgSize,
  pngSize
}: OutputBoxProps) => {
  const { pixelMode } = usePixelate();
  const [isCopied, setIsCopied] = React.useState(false);

  const handleCopyClick = async () => {
    onDownload('copy');
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="flex flex-col w-full">
      <div className="aspect-square w-full border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 overflow-hidden">
        <div className="h-10 border-b-2 border-neutral-700 dark:border-neutral-200 p-2 flex justify-between items-center">
          <span className="text-sm font-mono tracking-tight dark:text-white">{title}</span>
          <button 
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 rounded"
          >
            <span className="text-sm font-mono dark:text-white">×</span>
          </button>
        </div>
        {type === 'text' ? (
          <div className="h-[calc(100%-40px)] p-4 overflow-auto">
            {children}
          </div>
        ) : (
          <div className="h-[calc(100%-40px)] overflow-hidden flex items-center justify-center p-4">
            {children}
          </div>
        )}
      </div>
      {downloadType !== 'none' && (
        <div className={`grid ${downloadType === 'png' ? 'grid-cols-2' : 'grid-cols-1'} gap-4 mt-4`}>
          {downloadType === 'png' && (
            <>
              <button
                onClick={() => onDownload('png')}
                disabled={isDownloadDisabled}
                className="h-12 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 font-mono dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Download PNG {pngSize ? ` (~${pngSize})` : ''}
              </button>
              {pixelMode && (
                <button
                  onClick={() => onDownload('svg')}
                  disabled={isDownloadDisabled}
                  className="h-12 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 font-mono dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Download SVG {svgSize ? ` (~${svgSize})` : ''}
                </button>
              )}
            </>
          )}
          {downloadType === 'copy' && (
            <button
              onClick={handleCopyClick}
              disabled={isDownloadDisabled}
              className="h-12 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 font-mono dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed relative overflow-hidden"
            >
              <span className={`absolute inset-0 flex items-center justify-center transition-transform duration-200 ${isCopied ? 'translate-y-full' : 'translate-y-0'}`}>
                Copy Token URI
              </span>
              <span className={`absolute inset-0 flex items-center justify-center transition-transform duration-200 ${isCopied ? 'translate-y-0' : '-translate-y-full'}`}>
                Copied!
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}; 