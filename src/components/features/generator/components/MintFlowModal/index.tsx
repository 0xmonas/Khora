'use client';

import { useGenerator } from '../../GeneratorContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { formatEther } from 'viem';
import { cn } from '@/lib/utils';

type StepStatus = 'pending' | 'active' | 'done' | 'error';

const STEPS = [
  { label: 'Commit', desc: 'Pay mint price' },
  { label: 'Generate', desc: 'AI creates your agent' },
  { label: 'Reveal', desc: 'Put SVG on-chain' },
  { label: 'Complete', desc: 'NFT minted' },
] as const;

function getStepStatuses(
  currentStep: string,
): StepStatus[] {
  switch (currentStep) {
    case 'committing':
      return ['active', 'pending', 'pending', 'pending'];
    case 'generating':
      return ['done', 'active', 'pending', 'pending'];
    case 'ready_to_reveal':
      return ['done', 'done', 'pending', 'pending'];
    case 'revealing':
      return ['done', 'done', 'active', 'pending'];
    case 'reveal_failed':
      return ['done', 'done', 'error', 'pending'];
    case 'complete':
      return ['done', 'done', 'done', 'done'];
    default:
      return ['pending', 'pending', 'pending', 'pending'];
  }
}

function StepIndicator({ number, label, desc, status }: {
  number: number;
  label: string;
  desc: string;
  status: StepStatus;
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          'w-4 h-4 flex-shrink-0 flex items-center justify-center text-[8px] font-mono border-2',
          status === 'pending' && 'border-neutral-300 dark:border-neutral-600',
          status === 'active' && 'border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200 animate-pulse',
          status === 'done' && 'border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200',
          status === 'error' && 'border-red-500 bg-red-500',
        )}
      >
        {status === 'done' && <span className="text-white dark:text-neutral-900">+</span>}
        {status === 'error' && <span className="text-white">x</span>}
      </div>
      <div className="flex-1 min-w-0">
        <span
          className={cn(
            'font-mono text-xs',
            status === 'pending' && 'text-neutral-400 dark:text-neutral-600',
            status === 'active' && 'text-neutral-900 dark:text-white',
            status === 'done' && 'text-neutral-500 dark:text-neutral-400',
            status === 'error' && 'text-red-500',
          )}
        >
          {number}. {label}
        </span>
        {status === 'active' && (
          <span className="font-mono text-[10px] text-neutral-500 dark:text-neutral-400 ml-2">
            {desc}
          </span>
        )}
      </div>
    </div>
  );
}

function StepContent() {
  const {
    currentStep,
    progress,
    mintPrice,
    pixelatedImage,
    generatedImage,
    mintedTokenId,
    triggerReveal,
    retryReveal,
    error,
  } = useGenerator();

  const imageToShow = pixelatedImage || generatedImage;

  // Step 1: Committing
  if (currentStep === 'committing') {
    return (
      <div className="space-y-3">
        <p className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
          Confirm the commit transaction in your wallet.
        </p>
        {mintPrice !== undefined && (
          <div className="flex justify-between font-mono text-xs">
            <span className="text-neutral-500">Price:</span>
            <span className="dark:text-white">{formatEther(mintPrice)} ETH</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-neutral-700 dark:bg-neutral-200 animate-pulse" />
          <span className="font-mono text-xs text-neutral-500">Waiting for wallet...</span>
        </div>
      </div>
    );
  }

  // Step 2: Generating
  if (currentStep === 'generating') {
    return (
      <div className="space-y-3">
        <p className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
          AI is generating your agent portrait.
        </p>
        <div className="w-full h-2 border-2 border-neutral-700 dark:border-neutral-200">
          <div
            className="h-full bg-neutral-700 dark:bg-neutral-200 transition-all duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>
        <span
          className="font-mono text-xs tabular-nums dark:text-white"
          style={{ fontFamily: 'var(--font-departure-mono)' }}
        >
          {progress.toFixed(1)}%
        </span>
      </div>
    );
  }

  // Step 3: Ready to reveal
  if (currentStep === 'ready_to_reveal') {
    return (
      <div className="space-y-3">
        {imageToShow && (
          <div className="w-full aspect-square max-h-48 border-2 border-neutral-700 dark:border-neutral-200 overflow-hidden flex items-center justify-center bg-white dark:bg-neutral-900">
            <img
              src={imageToShow}
              alt="Generated agent"
              className="max-w-full max-h-full object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
        )}
        <button
          onClick={triggerReveal}
          className="w-full h-12 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 dark:text-white font-mono text-sm hover:bg-neutral-700 hover:text-white dark:hover:bg-neutral-200 dark:hover:text-neutral-900 transition-colors"
        >
          REVEAL
        </button>
        <p className="font-mono text-[10px] text-neutral-500 text-center">
          This will open your wallet to put the SVG on-chain
        </p>
      </div>
    );
  }

  // Step 3 active: Revealing
  if (currentStep === 'revealing') {
    return (
      <div className="space-y-3">
        {imageToShow && (
          <div className="w-full aspect-square max-h-48 border-2 border-neutral-700 dark:border-neutral-200 overflow-hidden flex items-center justify-center bg-white dark:bg-neutral-900">
            <img
              src={imageToShow}
              alt="Generated agent"
              className="max-w-full max-h-full object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
        )}
        <p className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
          Confirm the reveal transaction in your wallet.
        </p>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-neutral-700 dark:bg-neutral-200 animate-pulse" />
          <span className="font-mono text-xs text-neutral-500">Waiting for wallet...</span>
        </div>
      </div>
    );
  }

  // Step 3 failed: Reveal failed
  if (currentStep === 'reveal_failed') {
    return (
      <div className="space-y-3">
        {imageToShow && (
          <div className="w-full aspect-square max-h-48 border-2 border-neutral-700 dark:border-neutral-200 overflow-hidden flex items-center justify-center bg-white dark:bg-neutral-900">
            <img
              src={imageToShow}
              alt="Generated agent"
              className="max-w-full max-h-full object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
        )}
        {error && (
          <div className="border-2 border-red-500 p-3">
            <p className="font-mono text-xs text-red-500">{error}</p>
          </div>
        )}
        <button
          onClick={retryReveal}
          className="w-full h-12 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 dark:text-white font-mono text-sm hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors"
        >
          RETRY REVEAL
        </button>
      </div>
    );
  }

  // Step 4: Complete
  if (currentStep === 'complete') {
    return (
      <div className="space-y-3">
        {imageToShow && (
          <div className="w-full aspect-square max-h-48 border-2 border-neutral-700 dark:border-neutral-200 overflow-hidden flex items-center justify-center bg-white dark:bg-neutral-900">
            <img
              src={imageToShow}
              alt="Minted agent"
              className="max-w-full max-h-full object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          </div>
        )}
        {mintedTokenId !== null && (
          <div className="flex justify-between font-mono text-xs">
            <span className="text-neutral-500">Token ID:</span>
            <span className="dark:text-white">#{mintedTokenId.toString()}</span>
          </div>
        )}
        <p className="font-mono text-xs text-green-600 dark:text-green-400">
          Agent minted successfully.
        </p>
      </div>
    );
  }

  return null;
}

export function MintFlowModal() {
  const { isModalOpen, closeModal, currentStep, error } = useGenerator();

  const statuses = getStepStatuses(currentStep);

  // Modal can only be closed in safe states
  const canClose = currentStep === 'complete' || currentStep === 'input' || currentStep === 'ready_to_reveal';

  const handleOpenChange = (open: boolean) => {
    if (!open && canClose) {
      closeModal();
    }
  };

  return (
    <Dialog open={isModalOpen} onOpenChange={handleOpenChange}>
      <DialogContent
        onPointerDownOutside={(e) => { if (!canClose) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (!canClose) e.preventDefault(); }}
        onInteractOutside={(e) => { if (!canClose) e.preventDefault(); }}
        className="p-0"
      >
        <DialogHeader>
          <DialogTitle>mint_flow</DialogTitle>
          {canClose && currentStep !== 'input' && (
            <button
              onClick={closeModal}
              className="w-6 h-6 flex items-center justify-center hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5"
            >
              <span className="text-sm font-mono dark:text-white">x</span>
            </button>
          )}
        </DialogHeader>
        <DialogDescription className="sr-only">
          Step-by-step mint flow for your NFT agent
        </DialogDescription>

        <div className="p-4 space-y-4">
          {/* Step indicators */}
          <div className="space-y-2">
            {STEPS.map((step, i) => (
              <StepIndicator
                key={step.label}
                number={i + 1}
                label={step.label}
                desc={step.desc}
                status={statuses[i]}
              />
            ))}
          </div>

          {/* Divider */}
          <div className="border-t-2 border-neutral-700 dark:border-neutral-200" />

          {/* Active step content */}
          <StepContent />

          {/* Error display (only for non-reveal errors, reveal errors shown in StepContent) */}
          {error && currentStep !== 'reveal_failed' && (
            <div className="border-2 border-red-500 p-3">
              <p className="font-mono text-xs text-red-500">{error}</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
