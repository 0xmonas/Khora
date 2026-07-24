'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Check } from 'lucide-react';
import { useBridge } from '../BridgeContext';
import { CHAIN_CONFIG } from '@/types/agent';

function chainName(chainId: number): string {
  const entry = Object.values(CHAIN_CONFIG).find((c) => c.chainId === chainId);
  return entry?.name || `chain ${chainId}`;
}

export function LinkWalletModal() {
  const { linkPreview, confirmLink, cancelLink, linkStatus, linkError } = useBridge();
  const [acknowledged, setAcknowledged] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(0);

  const deadline = linkPreview ? Number(linkPreview.blob.deadline) : 0;

  useEffect(() => {
    if (!linkPreview) {
      setAcknowledged(false);
      return;
    }
    const tick = () => setSecondsLeft(Math.max(0, deadline - Math.floor(Date.now() / 1000)));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [linkPreview, deadline]);

  if (!linkPreview) return null;

  const { blob, agentTokenId, agentChainId, sigState } = linkPreview;
  const isLinking = linkStatus === 'linking';
  const expired = secondsLeft <= 0;
  const needsAck = sigState === 'unrecoverable';
  const canConfirm = !isLinking && !expired && (!needsAck || acknowledged);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-md rounded-md border-2 border-neutral-700 dark:border-neutral-200 bg-white dark:bg-neutral-950 p-5 space-y-4">
        <div className="space-y-1">
          <p className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">
            Confirm agent wallet
          </p>
          <h2 className="font-mono text-sm text-foreground">
            Bind a wallet to agent #{agentTokenId}
          </h2>
        </div>

        <p className="font-mono text-[11px] leading-relaxed text-neutral-600 dark:text-neutral-400">
          This link code asks you to set the wallet below as your agent’s onchain wallet.
          Anything that resolves your agent will treat this address as the agent itself.
          Check it against your runtime before approving.
        </p>

        <div className="rounded-md border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">
              Wallet to bind
            </p>
            <p className="font-mono text-[12px] text-foreground break-all select-all">
              {blob.wallet}
            </p>
          </div>
          <div className="flex items-center justify-between gap-3 pt-1">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">Agent</p>
              <p className="font-mono text-[11px] text-foreground">#{blob.agentId}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">Chain</p>
              <p className="font-mono text-[11px] text-foreground">{chainName(agentChainId)}</p>
            </div>
            <div>
              <p className="font-mono text-[10px] uppercase tracking-wider text-neutral-500">Expires</p>
              <p className={`font-mono text-[11px] ${expired ? 'text-red-500' : 'text-foreground'}`}>
                {expired ? 'expired' : `${secondsLeft}s`}
              </p>
            </div>
          </div>
        </div>

        {sigState === 'ok' ? (
          <p className="flex items-start gap-2 font-mono text-[11px] text-green-600 dark:text-green-500">
            <Check size={14} className="mt-px shrink-0" />
            Signature verified: this code was signed by the wallet shown above.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="flex items-start gap-2 font-mono text-[11px] text-amber-600 dark:text-amber-500">
              <AlertTriangle size={14} className="mt-px shrink-0" />
              This signature could not be verified in your browser. That is expected for a
              smart-contract wallet, but it also means a bad code cannot be ruled out here.
              Only continue if this address matches your own runtime.
            </p>
            <label className="flex items-start gap-2 font-mono text-[11px] text-neutral-600 dark:text-neutral-400 cursor-pointer">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                className="mt-0.5"
              />
              I confirm this is my agent’s wallet address.
            </label>
          </div>
        )}

        {linkError && (
          <p className="font-mono text-[10px] text-red-500 leading-relaxed">{linkError}</p>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={cancelLink}
            disabled={isLinking}
            className="flex-1 py-2 rounded-md border-2 border-neutral-700 dark:border-neutral-200 font-mono text-xs uppercase tracking-wider text-foreground hover:opacity-80 transition-opacity disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirmLink}
            disabled={!canConfirm}
            className="flex-1 py-2 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black font-mono text-xs uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isLinking ? 'Linking…' : expired ? 'Expired' : 'Confirm & Sign'}
          </button>
        </div>
      </div>
    </div>
  );
}
