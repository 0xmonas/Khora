'use client';

import {
  createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode,
} from 'react';
import { useAccount, useSwitchChain, useWriteContract, usePublicClient } from 'wagmi';
import {
  BOOA_ETH_ABI, BURN_HELPER_ABI, SHAPE_BOOA_ABI,
  ETH_MAINNET_CHAIN_ID, SHAPE_MAINNET_CHAIN_ID,
} from '@/lib/contracts/booa-eth';

export type MigrateStep =
  | 'idle' | 'approving' | 'burning' | 'awaiting_tickets' | 'switching' | 'claiming' | 'done' | 'error';

export interface MigrationStatus {
  enabled: boolean;
  reason: string | null;
  booaEth: `0x${string}` | null;
  burnHelper: `0x${string}` | null;
  shapeBooa: `0x${string}` | null;
  operator: `0x${string}` | null;
  ethChainId: number;
  shapeChainId: number;
  confirmations: number;
}

interface TicketResult {
  tokenId: number;
  signature: `0x${string}` | null;
  status: 'ready' | 'not_burned' | 'unconfirmed' | 'already_claimed' | 'error';
}

interface MigrateState {
  status: MigrationStatus | null;
  loadingStatus: boolean;
  holdings: number[];
  loadingHoldings: boolean;
  selected: Set<number>;
  step: MigrateStep;
  error: string | null;
  progressNote: string;
  burnTxHash: `0x${string}` | null;
  claimTxHash: `0x${string}` | null;
  claimedTokenIds: number[];
  toggle: (id: number) => void;
  selectAll: () => void;
  clearSelection: () => void;
  refreshHoldings: () => Promise<void>;
  migrate: () => Promise<void>;
  reset: () => void;
}

const Ctx = createContext<MigrateState | null>(null);

export function useMigrate(): MigrateState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useMigrate must be used within MigrateProvider');
  return v;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function MigrateProvider({ children }: { children: ReactNode }) {
  const { address, chainId } = useAccount();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const shapeClient = usePublicClient({ chainId: SHAPE_MAINNET_CHAIN_ID });
  const ethClient = usePublicClient({ chainId: ETH_MAINNET_CHAIN_ID });

  const [status, setStatus] = useState<MigrationStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [holdings, setHoldings] = useState<number[]>([]);
  const [loadingHoldings, setLoadingHoldings] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [step, setStep] = useState<MigrateStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [progressNote, setProgressNote] = useState('');
  const [burnTxHash, setBurnTxHash] = useState<`0x${string}` | null>(null);
  const [claimTxHash, setClaimTxHash] = useState<`0x${string}` | null>(null);
  const [claimedTokenIds, setClaimedTokenIds] = useState<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/migration/status');
        const data = await res.json();
        if (!cancelled) setStatus(data);
      } catch {
        if (!cancelled) setStatus(null);
      } finally {
        if (!cancelled) setLoadingStatus(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const refreshHoldings = useCallback(async () => {
    if (!address) { setHoldings([]); return; }
    setLoadingHoldings(true);
    try {
      const res = await fetch(`/api/migration/holdings/${address}`);
      const data = await res.json();
      setHoldings(Array.isArray(data.tokenIds) ? data.tokenIds : []);
    } catch {
      setHoldings([]);
    } finally {
      setLoadingHoldings(false);
    }
  }, [address]);

  useEffect(() => { void refreshHoldings(); }, [refreshHoldings]);

  const toggle = useCallback((id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => setSelected(new Set(holdings)), [holdings]);
  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const reset = useCallback(() => {
    setStep('idle');
    setError(null);
    setProgressNote('');
    setBurnTxHash(null);
    setClaimTxHash(null);
    setClaimedTokenIds([]);
    setSelected(new Set());
  }, []);

  const fail = useCallback((msg: string) => {
    setStep('error');
    setError(msg);
    setProgressNote('');
  }, []);

  const migrate = useCallback(async () => {
    if (!address) return fail('Connect your wallet first.');
    if (!status?.enabled || !status.booaEth || !status.burnHelper || !status.shapeBooa) {
      return fail('Migration is not live yet.');
    }
    const ids = Array.from(selected).sort((a, b) => a - b);
    if (ids.length === 0) return fail('Select at least one BOOA to migrate.');
    if (!shapeClient || !ethClient) return fail('RPC client unavailable. Retry in a moment.');

    const burnHelper = status.burnHelper;
    const booaEth = status.booaEth;
    const shapeBooa = status.shapeBooa;
    const bigIds = ids.map((n) => BigInt(n));

    try {
      setError(null);

      // ── 1. Ensure we're on Shape and BurnHelper is approved ──
      if (chainId !== SHAPE_MAINNET_CHAIN_ID) {
        setStep('switching');
        setProgressNote('Switch your wallet to Shape…');
        await switchChainAsync({ chainId: SHAPE_MAINNET_CHAIN_ID });
      }

      const approved = await shapeClient.readContract({
        address: shapeBooa,
        abi: SHAPE_BOOA_ABI,
        functionName: 'isApprovedForAll',
        args: [address, burnHelper],
      });

      if (!approved) {
        setStep('approving');
        setProgressNote('Approve the burn helper (one-time)…');
        const approveTx = await writeContractAsync({
          chainId: SHAPE_MAINNET_CHAIN_ID,
          address: shapeBooa,
          abi: SHAPE_BOOA_ABI,
          functionName: 'setApprovalForAll',
          args: [burnHelper, true],
        });
        await shapeClient.waitForTransactionReceipt({ hash: approveTx });
      }

      // ── 2. Batch-burn the selected tokens on Shape ──
      setStep('burning');
      setProgressNote(`Burning ${ids.length} BOOA on Shape…`);
      const burnTx = await writeContractAsync({
        chainId: SHAPE_MAINNET_CHAIN_ID,
        address: burnHelper,
        abi: BURN_HELPER_ABI,
        functionName: 'batchBurn',
        args: [bigIds],
      });
      setBurnTxHash(burnTx);
      await shapeClient.waitForTransactionReceipt({ hash: burnTx });

      // ── 3. Wait for the backend to confirm burns + return signed tickets ──
      setStep('awaiting_tickets');
      const confirmations = status.confirmations || 10;
      setProgressNote(`Waiting for ${confirmations} Shape confirmations, then signing tickets…`);

      const tickets = await pollTickets(address, ids);
      const ready = tickets.filter((t) => t.status === 'ready' && t.signature);
      if (ready.length === 0) {
        return fail('No tickets were issued. Burns may still be confirming — retry in a minute.');
      }

      // ── 4. Switch to Ethereum and claim ──
      setStep('switching');
      setProgressNote('Switch your wallet to Ethereum…');
      await switchChainAsync({ chainId: ETH_MAINNET_CHAIN_ID });

      setStep('claiming');
      setProgressNote(`Claiming ${ready.length} BOOA on Ethereum…`);
      const claimIds = ready.map((t) => BigInt(t.tokenId));
      const sigs = ready.map((t) => t.signature as `0x${string}`);
      const claimTx = await writeContractAsync({
        chainId: ETH_MAINNET_CHAIN_ID,
        address: booaEth,
        abi: BOOA_ETH_ABI,
        functionName: 'claim',
        args: [claimIds, sigs],
      });
      setClaimTxHash(claimTx);
      await ethClient.waitForTransactionReceipt({ hash: claimTx });

      setClaimedTokenIds(ready.map((t) => t.tokenId));
      setStep('done');
      setProgressNote('');
      void refreshHoldings();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Migration failed.';
      // Surface the common wallet rejection cleanly.
      fail(/user rejected|denied/i.test(msg) ? 'Transaction rejected in wallet.' : msg);
    }
  }, [address, status, selected, chainId, shapeClient, ethClient, switchChainAsync, writeContractAsync, refreshHoldings, fail]);

  const value = useMemo<MigrateState>(() => ({
    status, loadingStatus, holdings, loadingHoldings, selected, step, error, progressNote,
    burnTxHash, claimTxHash, claimedTokenIds,
    toggle, selectAll, clearSelection, refreshHoldings, migrate, reset,
  }), [status, loadingStatus, holdings, loadingHoldings, selected, step, error, progressNote,
    burnTxHash, claimTxHash, claimedTokenIds, toggle, selectAll, clearSelection, refreshHoldings, migrate, reset]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * Poll the ticket endpoint until burns confirm. The backend only signs after
 * MIGRATION_CONFIRMATIONS Shape blocks, so early calls return `unconfirmed`.
 */
async function pollTickets(
  address: `0x${string}`,
  tokenIds: number[],
  attempts = 20,
  intervalMs = 6000,
): Promise<TicketResult[]> {
  let last: TicketResult[] = [];
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`/api/migration/tickets/${address}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ tokenIds }),
    });
    if (res.ok) {
      const data = await res.json();
      last = data.tickets ?? [];
      const pending = last.filter((t) => t.status === 'unconfirmed').length;
      const ready = last.filter((t) => t.status === 'ready').length;
      if (pending === 0 || ready === tokenIds.length) return last;
    } else if (res.status === 429) {
      await sleep(intervalMs * 2);
      continue;
    }
    await sleep(intervalMs);
  }
  return last;
}
