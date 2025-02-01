// OutputBox.tsx
'use client';

import { ReactNode } from "react";
import { CustomScrollArea } from "@/components/ui/custom-scroll-area";

interface OutputBoxProps {
 title: string;
 downloadType: 'json' | 'svg' | 'png' | 'none';
 onDownload: () => void;
 isDownloadDisabled?: boolean;
 children: ReactNode;
 type?: 'image' | 'text';
 onClose?: () => void;
}

export const OutputBox = ({ 
  title, 
  downloadType, 
  onDownload, 
  isDownloadDisabled = false,
  children,
  type = 'text',
  onClose
  }: OutputBoxProps) => {
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
          <CustomScrollArea className="h-[calc(100%-40px)] p-4">
            {children}
          </CustomScrollArea>
        ) : (
          <div className="h-[calc(100%-40px)] overflow-hidden flex items-center justify-center p-4">
            {children}
          </div>
        )}
      </div>
      {downloadType !== 'none' && (
        <button
          onClick={onDownload}
          disabled={isDownloadDisabled}
          className="w-full h-12 mt-4 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 font-mono dark:text-white hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Download {downloadType.toUpperCase()}
        </button>
      )}
    </div>
  );
  };