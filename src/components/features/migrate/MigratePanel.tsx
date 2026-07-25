'use client';

import { useAccount, useSwitchChain } from 'wagmi';
import { Loader2, Flame, ArrowRight, CheckCircle2, ExternalLink, Network } from 'lucide-react';
import { useMigrate, type MigrateStep } from './MigrateContext';
import { SHAPE_MAINNET_CHAIN_ID } from '@/lib/contracts/booa-eth';

const font = { fontFamily: 'var(--font-departure-mono)' };

const STEP_LABEL: Record<MigrateStep, string> = {
  idle: '',
  switching: 'Switching network…',
  approving: 'Approving burn helper…',
  burning: 'Burning on Shape…',
  awaiting_tickets: 'Confirming burns & signing…',
  claiming: 'Claiming on Ethereum…',
  done: 'Migration complete',
  error: 'Error',
};

export function MigratePanel() {
  const { isConnected, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const {
    status, loadingStatus, holdings, selected, step, error, progressNote,
    burnTxHash, claimTxHash, claimedTokenIds, pending,
    selectAll, clearSelection, migrate, claimBurned, reset,
  } = useMigrate();

  const count = selected.size;
  const busy = step !== 'idle' && step !== 'error' && step !== 'done';

  if (loadingStatus) {
    return <div className="border-2 border-neutral-700 dark:border-neutral-200 p-4 text-[11px] text-muted-foreground" style={font}>Loading migration status…</div>;
  }

  if (!status?.enabled) {
    return (
      <div className="border-2 border-neutral-700 dark:border-neutral-200 p-4 space-y-2">
        <p className="text-xs text-foreground uppercase tracking-wider" style={font}>Migration not live yet</p>
        <p className="text-[11px] text-muted-foreground leading-relaxed" style={font}>
          Shape → Ethereum migration hasn&apos;t opened. Check back soon.
        </p>
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="border-2 border-neutral-700 dark:border-neutral-200 p-4 space-y-3">
        <div className="flex items-center gap-2 text-foreground">
          <CheckCircle2 className="w-4 h-4" />
          <p className="text-xs uppercase tracking-wider" style={font}>Migrated {claimedTokenIds.length} BOOA</p>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed" style={font}>
          Your BOOA are now on Ethereum. The Shape originals are burned.
        </p>
        <div className="flex flex-col gap-1">
          {claimTxHash && (
            <a href={`https://etherscan.io/tx/${claimTxHash}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground" style={font}>
              Ethereum claim tx <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
          {burnTxHash && (
            <a href={`https://shapescan.xyz/tx/${burnTxHash}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground" style={font}>
              Shape burn tx <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>
        <button onClick={reset} className="w-full border-2 border-neutral-700 dark:border-neutral-200 p-2 text-[10px] uppercase hover:bg-foreground/5 transition-colors" style={font}>
          Migrate more
        </button>
      </div>
    );
  }

  const showRecovery = pending.length > 0;
  // Ethereum is the app's primary network, so holders land here on Ethereum and may not
  // see their Shape tokens in the wallet. Burning happens on Shape, so offer the switch
  // up front instead of only mid-flow.
  const onShape = chainId === SHAPE_MAINNET_CHAIN_ID;

  return (
    <div className="space-y-3">
    {isConnected && !onShape && (
      <div className="border-2 border-neutral-700 dark:border-neutral-200 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Network className="w-3.5 h-3.5 text-muted-foreground" />
          <p className="text-xs text-foreground uppercase tracking-wider" style={font}>Wallet is not on Shape</p>
        </div>
        <p className="text-[11px] text-muted-foreground leading-relaxed" style={font}>
          Your BOOAs still on Shape are listed below regardless, but burning happens on Shape.
          Switch now to see them in your wallet too — the migrate button switches for you either way.
        </p>
        <button
          onClick={() => { void switchChainAsync({ chainId: SHAPE_MAINNET_CHAIN_ID }).catch(() => {}); }}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 border-2 border-neutral-700 dark:border-neutral-200 p-2.5 text-[11px] uppercase text-foreground hover:bg-foreground/5 transition-colors disabled:opacity-30"
          style={font}
        >
          <Network className="w-3.5 h-3.5" /> Switch to Shape
        </button>
      </div>
    )}

    {showRecovery && (
      <div className="border-2 border-amber-500/70 dark:border-amber-400/70 bg-amber-500/5 p-4 space-y-3">
        <p className="text-xs text-amber-600 dark:text-amber-400 uppercase tracking-wider" style={font}>
          {pending.length} BOOA burned, not yet claimed
        </p>
        <p className="text-[11px] text-muted-foreground leading-relaxed" style={font}>
          You already burned these on Shape but the claim didn&apos;t land. They&apos;re safe — burns are permanent and there is no deadline. Claim them on Ethereum now; no re-burning needed.
        </p>
        <p className="text-[10px] text-muted-foreground/70 break-words" style={font}>
          #{pending.slice(0, 30).join(', #')}{pending.length > 30 ? '…' : ''}
        </p>
        {error && step === 'error' && <p className="text-[10px] text-red-400 leading-relaxed" style={font}>{error}</p>}
        {busy && (
          <div className="flex items-center gap-2 text-[10px] text-foreground border border-amber-500/40 p-2" style={font}>
            <Loader2 className="w-3 h-3 animate-spin shrink-0" />
            <span>{progressNote || STEP_LABEL[step]}</span>
          </div>
        )}
        <button
          onClick={() => (step === 'error' ? reset() : claimBurned())}
          disabled={!isConnected || busy}
          className="w-full flex items-center justify-center gap-2 border-2 border-amber-500/70 dark:border-amber-400/70 p-2.5 text-[11px] uppercase text-amber-700 dark:text-amber-300 disabled:opacity-30 hover:bg-amber-500/10 transition-colors"
          style={font}
        >
          {busy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Working…</>
            : step === 'error' ? 'Reset'
            : <><ArrowRight className="w-3.5 h-3.5" /> Claim {pending.length} BOOA on Ethereum</>}
        </button>
      </div>
    )}

    <div className="border-2 border-neutral-700 dark:border-neutral-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-foreground uppercase tracking-wider" style={font}>Migrate to Ethereum</p>
        <span className="text-[10px] text-muted-foreground" style={font}>{count}/{holdings.length}</span>
      </div>

      <div className="flex gap-1.5">
        <button onClick={selectAll} disabled={busy || holdings.length === 0}
          className="flex-1 border border-neutral-700 dark:border-neutral-600 p-1.5 text-[9px] uppercase hover:bg-foreground/5 transition-colors disabled:opacity-30" style={font}>
          Select all
        </button>
        <button onClick={clearSelection} disabled={busy || count === 0}
          className="flex-1 border border-neutral-700 dark:border-neutral-600 p-1.5 text-[9px] uppercase hover:bg-foreground/5 transition-colors disabled:opacity-30" style={font}>
          Clear
        </button>
      </div>

      <ol className="space-y-1 text-[10px] text-muted-foreground" style={font}>
        <li className="flex items-center gap-1.5"><Flame className="w-3 h-3" /> Burn selected on Shape</li>
        <li className="flex items-center gap-1.5"><ArrowRight className="w-3 h-3" /> Claim same IDs on Ethereum</li>
      </ol>

      {error && <p className="text-[10px] text-red-400 leading-relaxed" style={font}>{error}</p>}

      {busy && (
        <div className="flex items-center gap-2 text-[10px] text-foreground border border-neutral-700 dark:border-neutral-600 p-2" style={font}>
          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
          <span>{progressNote || STEP_LABEL[step]}</span>
        </div>
      )}

      <button
        onClick={() => (step === 'error' ? reset() : migrate())}
        disabled={!isConnected || busy || (step !== 'error' && count === 0)}
        className="w-full flex items-center justify-center gap-2 border-2 border-neutral-700 dark:border-neutral-200 p-2.5 text-[11px] uppercase disabled:opacity-30 hover:bg-foreground/5 transition-colors"
        style={font}
      >
        {busy ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Working…</>
          : step === 'error' ? 'Reset'
          : !isConnected ? 'Connect wallet'
          : count === 0 ? 'Select BOOA to migrate'
          : <><Flame className="w-3.5 h-3.5" /> Migrate {count} BOOA</>}
      </button>

      <p className="text-[9px] text-muted-foreground/50 leading-relaxed" style={font}>
        Burning is irreversible. Your Shape BOOA is destroyed and re-minted 1:1 on Ethereum with the same token ID and art.
      </p>
    </div>
    </div>
  );
}
