'use client';

import { useState, useEffect } from 'react';
import { Download, Maximize2, X } from 'lucide-react';
import { useGenerator } from '@/components/features/generator/GeneratorContext';
import { OutputBox } from '../OutputBox';
import { PixelReveal } from '../PixelReveal';

function StatusDisplay() {
  const { progress, currentStep } = useGenerator();

  const getMessage = () => {
    switch (currentStep) {
      case 'generating': return 'Generating...';
      case 'confirming': return 'Confirm in wallet...';
      case 'pending': return 'Confirming on-chain...';
      default: return 'Loading...';
    }
  };

  const showProgress = currentStep === 'generating';

  return (
    <div className="flex flex-col items-center justify-center gap-2 w-full h-full">
      {showProgress && (
        <span
          className="text-6xl sm:text-8xl font-black tabular-nums text-neutral-900 dark:text-white"
          style={{ fontFamily: 'var(--font-departure-mono)' }}
        >
          {progress.toFixed(1)}%
        </span>
      )}
      <span
        className="text-xs font-mono uppercase tracking-wider text-neutral-500"
        style={{ fontFamily: 'var(--font-departure-mono)' }}
      >
        {getMessage()}
      </span>
    </div>
  );
}

export function OutputSection() {
  const {
    mode,
    loading,
    downloadAgent,
    pixelatedImage,
    currentStep,
    reset,
  } = useGenerator();

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

  const imageToShow = pixelatedImage;
  const isIdle = currentStep === 'input';

  return (
    <>
      <div className="group">
        <OutputBox
          title={isIdle ? 'how_it_works' : 'agent_pfp'}
          type="image"
          onClose={isIdle ? undefined : () => reset()}
          className="w-full aspect-square"
        >
          {isIdle ? (
            <div className="w-full h-full flex items-center justify-center p-6">
              <div className="space-y-4 font-mono text-sm max-w-xs">
                {mode === 'create' ? (
                  <>
                    <div className="flex gap-3 items-start">
                      <span className="text-neutral-400 flex-shrink-0">01</span>
                      <div>
                        <p className="text-neutral-700 dark:text-neutral-300 font-medium">Mint</p>
                        <p className="text-neutral-500 dark:text-neutral-500 text-xs">Hit mint — AI generates a unique identity, pixel art portrait, and personality in one click</p>
                      </div>
                    </div>
                    <div className="flex gap-3 items-start">
                      <span className="text-neutral-400 flex-shrink-0">02</span>
                      <div>
                        <p className="text-neutral-700 dark:text-neutral-300 font-medium">On-chain forever</p>
                        <p className="text-neutral-500 dark:text-neutral-500 text-xs">Confirm one transaction — art & traits written directly on Base via SSTORE2. No IPFS, no links that break</p>
                      </div>
                    </div>
                    <div className="flex gap-3 items-start">
                      <span className="text-neutral-400 flex-shrink-0">03</span>
                      <div>
                        <p className="text-neutral-700 dark:text-neutral-300 font-medium">Register</p>
                        <p className="text-neutral-500 dark:text-neutral-500 text-xs">Optional — register on the ERC-8004 agent protocol to make your agent discoverable across chains</p>
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex gap-3 items-start">
                      <span className="text-neutral-400 flex-shrink-0">01</span>
                      <div>
                        <p className="text-neutral-700 dark:text-neutral-300 font-medium">Connect</p>
                        <p className="text-neutral-500 dark:text-neutral-500 text-xs">Connect wallet — we scan 9 chains for your registered ERC-8004 agents</p>
                      </div>
                    </div>
                    <div className="flex gap-3 items-start">
                      <span className="text-neutral-400 flex-shrink-0">02</span>
                      <div>
                        <p className="text-neutral-700 dark:text-neutral-300 font-medium">Reimagine</p>
                        <p className="text-neutral-500 dark:text-neutral-500 text-xs">Select an agent, hit mint — AI generates a new pixel art portrait for your agent</p>
                      </div>
                    </div>
                    <div className="flex gap-3 items-start">
                      <span className="text-neutral-400 flex-shrink-0">03</span>
                      <div>
                        <p className="text-neutral-700 dark:text-neutral-300 font-medium">Mint & update</p>
                        <p className="text-neutral-500 dark:text-neutral-500 text-xs">Mint on Base in one tx — then optionally update your ERC-8004 registry with the new art</p>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="w-full h-full flex items-center justify-center">
                {loading ? (
                  <StatusDisplay />
                ) : imageToShow ? (
                  <div
                    className="w-full h-full flex items-center justify-center cursor-pointer"
                    onClick={() => setLightboxOpen(true)}
                  >
                    <PixelReveal
                      src={imageToShow}
                      alt="Generated agent PFP"
                    />
                  </div>
                ) : null}
              </div>

              {/* Hover Action Buttons — inside OutputBox content area */}
              {currentStep === 'complete' && imageToShow && (
                <div className="absolute bottom-3 right-3 hidden sm:flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                  <button
                    onClick={() => downloadAgent('png')}
                    className="border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 p-2 transition-transform duration-200 ease-out hover:scale-[1.05]"
                    title="Download PNG"
                  >
                    <Download className="w-5 h-5 dark:text-white" />
                  </button>
                  <button
                    onClick={() => setLightboxOpen(true)}
                    className="border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 p-2 transition-transform duration-200 ease-out hover:scale-[1.05]"
                    title="View fullscreen"
                  >
                    <Maximize2 className="w-5 h-5 dark:text-white" />
                  </button>
                </div>
              )}
            </>
          )}
        </OutputBox>
      </div>

      {/* Lightbox */}
      {lightboxOpen && imageToShow && (
        <div
          className="fixed inset-0 z-50 bg-neutral-900/95 flex flex-col items-center justify-center p-8"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-6 right-6 text-white transition-transform duration-200 ease-out hover:scale-[1.1] z-10"
          >
            <X className="w-8 h-8" />
          </button>

          <img
            src={imageToShow}
            alt="Agent PFP fullscreen"
            className="max-h-[85vh] max-w-[85vw] object-contain"
            style={{ imageRendering: 'pixelated' }}
            onClick={(e) => e.stopPropagation()}
          />

          <div
            className="flex gap-3 mt-6"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => downloadAgent('png')}
              className="h-10 px-4 border-2 border-neutral-200 bg-neutral-900 font-mono text-sm text-white hover:bg-neutral-800 transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              PNG
            </button>
            <button
              onClick={() => downloadAgent('svg')}
              className="h-10 px-4 border-2 border-neutral-200 bg-neutral-900 font-mono text-sm text-white hover:bg-neutral-800 transition-colors flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              SVG
            </button>
          </div>
        </div>
      )}
    </>
  );
}
