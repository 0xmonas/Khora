'use client';

import React from 'react';
import { usePixelate } from '../../PixelateContext';

type OutputBoxProps = {
  title: string;
  children: React.ReactNode;
  downloadType: 'none' | 'png' | 'svg';
  onDownload: (type: 'png' | 'svg') => void;
  isDownloadDisabled: boolean;
  type: 'text' | 'image';
  onClose: () => void;
};

export const OutputBox = ({ 
  title,
  children,
  downloadType,
  onDownload,
  isDownloadDisabled,
  type,
  onClose
}: OutputBoxProps) => {
  const { loading, imageLoading, pixelMode } = usePixelate();
  const [isProcessing, setIsProcessing] = React.useState(false);

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-sm font-mono dark:text-white">{title}</h3>
        <button
          onClick={onClose}
          className="text-sm font-mono text-neutral-500 hover:text-black dark:hover:text-white transition-colors"
        >
          ✕
        </button>
      </div>

      <div className={`w-full border-2 border-neutral-700 dark:border-neutral-200 ${
        type === 'text' ? 'p-3' : ''
      }`}>
        {children}
      </div>

      {downloadType !== 'none' && (
        <div className="grid grid-cols-2 gap-4 mt-4">
          <button
            onClick={() => onDownload('png')}
            disabled={isDownloadDisabled || isProcessing}
            className="h-10 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 font-mono text-sm dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Download PNG
          </button>
          {pixelMode && (
            <button
              onClick={() => onDownload('svg')}
              disabled={isDownloadDisabled || isProcessing}
              className="h-10 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 font-mono text-sm dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Download SVG
            </button>
          )}
        </div>
      )}
    </div>
  );
}; 