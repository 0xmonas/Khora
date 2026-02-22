'use client';

import { useEffect, useState } from 'react';
import { useChainId } from 'wagmi';
import { base } from 'wagmi/chains';
import { useBridge } from '../BridgeContext';

function getExplorerUrl(chainId: number, hash: string): string {
  if (chainId === base.id) return `https://basescan.org/tx/${hash}`;
  return `https://sepolia.basescan.org/tx/${hash}`;
}

export function RegisterModal() {
  const {
    isModalOpen, closeModal,
    step, registryAgentId, registerTxHash, error,
    agentName, agentImage, reset,
  } = useBridge();

  const chainId = useChainId();
  const [countdown, setCountdown] = useState(30);

  // Auto-close on complete
  useEffect(() => {
    if (step !== 'complete') { setCountdown(30); return; }
    const interval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { closeModal(); return 30; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step, closeModal]);

  if (!isModalOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-neutral-900 border-2 border-neutral-700 dark:border-neutral-200 w-full max-w-md mx-4 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-mono text-sm dark:text-white">
            {step === 'registering' ? 'Registering Agent' : 'Registration Complete'}
          </h2>
          {step === 'complete' && (
            <button
              onClick={closeModal}
              className="font-mono text-xs text-neutral-500 hover:text-black dark:hover:text-white"
            >
              Close ({countdown}s)
            </button>
          )}
        </div>

        {/* NFT Preview */}
        <div className="flex items-center gap-3 mb-6">
          {agentImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={agentImage}
              alt={agentName}
              className="w-16 h-16 object-cover border border-neutral-300 dark:border-neutral-600"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div>
            <p className="font-mono text-sm dark:text-white">{agentName}</p>
          </div>
        </div>

        {/* Status */}
        {step === 'registering' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-neutral-400 border-t-neutral-700 dark:border-neutral-500 dark:border-t-neutral-200 rounded-full animate-spin" />
              <p className="font-mono text-xs dark:text-neutral-300">
                Registering on ERC-8004 Identity Registry...
              </p>
            </div>
            {registerTxHash && (
              <a
                href={getExplorerUrl(chainId, registerTxHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[10px] text-neutral-400 hover:text-neutral-200 break-all"
              >
                tx: {registerTxHash.slice(0, 10)}...{registerTxHash.slice(-8)}
              </a>
            )}
          </div>
        )}

        {step === 'complete' && (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-green-500 font-mono">&#10003;</span>
              <p className="font-mono text-xs dark:text-neutral-300">
                Agent registered successfully!
              </p>
            </div>

            {registryAgentId !== null && (
              <div className="bg-neutral-100 dark:bg-neutral-800 p-3">
                <p className="font-mono text-xs text-neutral-500">Registry Agent ID</p>
                <p className="font-mono text-lg dark:text-white">{registryAgentId.toString()}</p>
              </div>
            )}

            {registerTxHash && (
              <a
                href={getExplorerUrl(chainId, registerTxHash)}
                target="_blank"
                rel="noopener noreferrer"
                className="block font-mono text-[10px] text-neutral-400 hover:text-neutral-200 break-all"
              >
                tx: {registerTxHash.slice(0, 10)}...{registerTxHash.slice(-8)}
              </a>
            )}

            <button
              onClick={reset}
              className="w-full h-10 border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-900 dark:text-white font-mono text-xs hover:bg-neutral-700/5 dark:hover:bg-neutral-200/5 transition-colors mt-4"
            >
              BRIDGE ANOTHER NFT
            </button>
          </div>
        )}

        {error && (
          <p className="font-mono text-xs text-red-500 mt-3">{error}</p>
        )}
      </div>
    </div>
  );
}
