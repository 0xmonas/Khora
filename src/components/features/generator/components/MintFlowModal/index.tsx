'use client';

import { useEffect, useState, useRef } from 'react';
import { useGenerator } from '../../GeneratorContext';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { formatEther } from 'viem';
import { useChainId } from 'wagmi';
import { base } from 'wagmi/chains';
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
    case 'registering':
    case 'register_complete':
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

function TxHashLink({ hash, label }: { hash: `0x${string}`; label: string }) {
  const chainId = useChainId();
  const isMainnet = chainId === base.id;
  const explorerBase = isMainnet
    ? 'https://basescan.org'
    : 'https://sepolia.basescan.org';
  const short = `${hash.slice(0, 6)}...${hash.slice(-4)}`;

  return (
    <div className="flex justify-between font-mono text-[10px]">
      <span className="text-neutral-500">{label}:</span>
      <a
        href={`${explorerBase}/tx/${hash}`}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-500 hover:underline"
      >
        {short}
      </a>
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
    regenerateForReveal,
    registerAgent,
    registryAgentId,
    registerTxHash,
    hasRevealData,
    error,
    commitTxHash,
    revealTxHash,
    mode,
    importedRegistryTokenId,
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
        {commitTxHash && <TxHashLink hash={commitTxHash} label="Commit tx" />}
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
        {commitTxHash && <TxHashLink hash={commitTxHash} label="Commit tx" />}
        {revealTxHash && <TxHashLink hash={revealTxHash} label="Reveal tx" />}
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
        {hasRevealData ? (
          <button
            onClick={retryReveal}
            className="w-full h-12 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 dark:text-white font-mono text-sm hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors"
          >
            RETRY REVEAL
          </button>
        ) : (
          <button
            onClick={regenerateForReveal}
            className="w-full h-12 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 dark:text-white font-mono text-sm hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors"
          >
            REGENERATE IMAGE
          </button>
        )}
      </div>
    );
  }

  // Step 4: Complete — with optional registration
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
        {commitTxHash && <TxHashLink hash={commitTxHash} label="Commit tx" />}
        {revealTxHash && <TxHashLink hash={revealTxHash} label="Reveal tx" />}
        <p className="font-mono text-xs text-green-600 dark:text-green-400">
          Agent minted successfully.
        </p>

        {/* Agent Registration CTA */}
        <div className="border-t border-neutral-200 dark:border-neutral-700 pt-3 space-y-2">
          <button
            onClick={registerAgent}
            className="w-full h-10 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 dark:text-white font-mono text-xs hover:bg-neutral-700 hover:text-white dark:hover:bg-neutral-200 dark:hover:text-neutral-900 transition-colors"
          >
            {mode === 'import' && importedRegistryTokenId
              ? 'UPDATE AGENT ON PROTOCOL'
              : 'REGISTER ON AGENT PROTOCOL'}
          </button>
          <p className="font-mono text-[10px] text-neutral-400 text-center">
            {mode === 'import' && importedRegistryTokenId
              ? `updates your existing registry agent #${importedRegistryTokenId}`
              : 'optional — gas only, no fee'}
          </p>
        </div>
      </div>
    );
  }

  // Registering: waiting for wallet + tx confirmation
  if (currentStep === 'registering') {
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
        <p className="font-mono text-xs text-neutral-500 dark:text-neutral-400">
          {mode === 'import' && importedRegistryTokenId
            ? 'Updating agent on Identity Registry...'
            : 'Registering agent on Identity Registry...'}
        </p>
        {registerTxHash && <TxHashLink hash={registerTxHash} label={mode === 'import' ? 'Update tx' : 'Register tx'} />}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-neutral-700 dark:bg-neutral-200 animate-pulse" />
          <span className="font-mono text-xs text-neutral-500">Waiting for confirmation...</span>
        </div>
      </div>
    );
  }

  // Register complete
  if (currentStep === 'register_complete') {
    return (
      <div className="space-y-3">
        {imageToShow && (
          <div className="w-full aspect-square max-h-48 border-2 border-neutral-700 dark:border-neutral-200 overflow-hidden flex items-center justify-center bg-white dark:bg-neutral-900">
            <img
              src={imageToShow}
              alt="Registered agent"
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
        {registryAgentId !== null && (
          <div className="flex justify-between font-mono text-xs">
            <span className="text-neutral-500">Registry ID:</span>
            <span className="dark:text-white">#{registryAgentId.toString()}</span>
          </div>
        )}
        {registerTxHash && <TxHashLink hash={registerTxHash} label={mode === 'import' ? 'Update tx' : 'Register tx'} />}
        <p className="font-mono text-xs text-green-600 dark:text-green-400">
          {mode === 'import' && importedRegistryTokenId
            ? 'Agent updated on ERC-8004 protocol.'
            : 'Agent registered on ERC-8004 protocol.'}
        </p>
        <p className="font-mono text-[10px] text-neutral-400">
          {mode === 'import' && importedRegistryTokenId
            ? 'Your agent metadata has been updated on-chain.'
            : 'Your agent is now discoverable on the agent protocol.'}
        </p>
      </div>
    );
  }

  return null;
}

const AUTO_CLOSE_SECONDS = 30;

export function MintFlowModal() {
  const { isModalOpen, closeModal, currentStep, error } = useGenerator();
  const [countdown, setCountdown] = useState(AUTO_CLOSE_SECONDS);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-close countdown only after registration/update is complete
  useEffect(() => {
    if (currentStep === 'register_complete' && isModalOpen) {
      setCountdown(AUTO_CLOSE_SECONDS);
      timerRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (timerRef.current) clearInterval(timerRef.current);
      };
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [currentStep, isModalOpen]);

  // Close modal when countdown reaches 0
  useEffect(() => {
    if (countdown === 0 && currentStep === 'register_complete' && isModalOpen) {
      closeModal();
    }
  }, [countdown, currentStep, isModalOpen, closeModal]);

  const statuses = getStepStatuses(currentStep);

  // Modal can only be closed in safe states
  const canClose = currentStep === 'complete' || currentStep === 'register_complete' || currentStep === 'input' || currentStep === 'ready_to_reveal' || currentStep === 'reveal_failed';

  const handleOpenChange = (open: boolean) => {
    if (!open && canClose) {
      closeModal();
    }
  };

  // Non-modal during reveal_failed so overlay doesn't block header (wallet/chain switcher)
  const isNonModal = currentStep === 'reveal_failed';

  return (
    <Dialog open={isModalOpen} onOpenChange={handleOpenChange} modal={!isNonModal}>
      <DialogContent
        onPointerDownOutside={(e) => { if (!canClose) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (!canClose) e.preventDefault(); }}
        onInteractOutside={(e) => { if (!canClose) e.preventDefault(); }}
        showOverlay={!isNonModal}
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

          {/* Auto-close countdown */}
          {currentStep === 'register_complete' && countdown > 0 && (
            <p className="font-mono text-[10px] text-neutral-400 text-center">
              closing in {countdown}s
            </p>
          )}

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
