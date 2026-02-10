'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useAccount,
  useChainId,
} from 'wagmi';
import { decodeEventLog, toHex } from 'viem';
import { BOOA_NFT_ABI, getContractAddress } from '@/lib/contracts/booa';

export type CommitRevealPhase =
  | 'idle'
  | 'committing'    // Waiting for wallet signature (commit tx)
  | 'committed'     // Commit tx confirmed, ready for generate
  | 'revealing'     // Waiting for wallet signature (reveal tx)
  | 'reveal_failed' // Reveal rejected/cancelled — retry possible
  | 'success'       // Reveal tx confirmed, NFT minted
  | 'error';

// ── localStorage persistence for slotIndex ──
const LS_KEY = 'booa_pending_commit';

type PendingCommit = {
  address: string;
  chainId: number;
  slotIndex: number;
};

function savePendingCommit(data: PendingCommit) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch {}
}

function loadPendingCommit(): PendingCommit | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

function clearPendingCommit() {
  try { localStorage.removeItem(LS_KEY); } catch {}
}

export function useCommitReveal() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const contractAddress = getContractAddress(chainId);

  // Read contract state
  const { data: mintPrice } = useReadContract({
    address: contractAddress,
    abi: BOOA_NFT_ABI,
    functionName: 'mintPrice',
    query: { enabled: !!contractAddress },
  });

  const { data: totalSupply, refetch: refetchSupply } = useReadContract({
    address: contractAddress,
    abi: BOOA_NFT_ABI,
    functionName: 'totalSupply',
    query: { enabled: !!contractAddress },
  });

  const { data: maxSupply } = useReadContract({
    address: contractAddress,
    abi: BOOA_NFT_ABI,
    functionName: 'maxSupply',
    query: { enabled: !!contractAddress },
  });

  // Commit phase write
  const {
    writeContract: writeCommit,
    data: commitTxHash,
    isPending: isCommitPending,
    error: commitWriteError,
    reset: resetCommit,
  } = useWriteContract();

  const {
    isLoading: isCommitConfirming,
    isSuccess: isCommitSuccess,
    data: commitReceipt,
    error: commitReceiptError,
  } = useWaitForTransactionReceipt({ hash: commitTxHash });

  // Reveal phase write
  const {
    writeContract: writeReveal,
    data: revealTxHash,
    isPending: isRevealPending,
    error: revealWriteError,
    reset: resetReveal,
  } = useWriteContract();

  const {
    isLoading: isRevealConfirming,
    isSuccess: isRevealSuccess,
    data: revealReceipt,
    error: revealReceiptError,
  } = useWaitForTransactionReceipt({ hash: revealTxHash });

  // Local state for commit data
  const [slotIndex, setSlotIndex] = useState<bigint | null>(null);
  const [recovered, setRecovered] = useState(false);

  // Extract slotIndex from CommitMint event + persist to localStorage
  if (commitReceipt && slotIndex === null) {
    for (const log of commitReceipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: BOOA_NFT_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === 'CommitMint' && 'slotIndex' in decoded.args) {
          const idx = decoded.args.slotIndex as bigint;
          setSlotIndex(idx);
          if (address) {
            savePendingCommit({ address, chainId, slotIndex: Number(idx) });
          }
          break;
        }
      } catch {
        continue;
      }
    }
  }

  // Recover slotIndex from localStorage on mount
  useEffect(() => {
    if (recovered || !address || !isConnected) return;
    setRecovered(true);

    const pending = loadPendingCommit();
    if (!pending) return;
    if (pending.address.toLowerCase() !== address.toLowerCase()) return;
    if (pending.chainId !== chainId) return;
    if (slotIndex !== null) return;

    setSlotIndex(BigInt(pending.slotIndex));
  }, [address, isConnected, chainId, recovered, slotIndex]);

  // Extract tokenId from Transfer event
  let tokenId: bigint | null = null;
  if (revealReceipt) {
    for (const log of revealReceipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: BOOA_NFT_ABI,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName === 'Transfer' && 'tokenId' in decoded.args) {
          tokenId = decoded.args.tokenId as bigint;
          break;
        }
      } catch {
        continue;
      }
    }
  }

  // Clean up localStorage on successful reveal
  useEffect(() => {
    if (isRevealSuccess) {
      clearPendingCommit();
    }
  }, [isRevealSuccess]);

  // Phase 1: Commit
  const commit = useCallback(() => {
    if (!isConnected || !address) {
      throw new Error('Wallet not connected');
    }

    writeCommit({
      address: contractAddress,
      abi: BOOA_NFT_ABI,
      functionName: 'commitMint',
      value: mintPrice ?? BigInt(0),
    });
  }, [isConnected, address, contractAddress, mintPrice, writeCommit]);

  // Phase 2: Reveal (with retry support)
  const reveal = useCallback((
    svgBytes: Uint8Array,
    traitsBytes: Uint8Array,
  ) => {
    if (!isConnected || !address) {
      throw new Error('Wallet not connected');
    }
    if (slotIndex === null) {
      throw new Error('No active commitment');
    }

    // Clear previous reveal error so retry works
    resetReveal();

    writeReveal({
      address: contractAddress,
      abi: BOOA_NFT_ABI,
      functionName: 'revealMint',
      args: [slotIndex, toHex(svgBytes), toHex(traitsBytes)],
    });
  }, [isConnected, address, contractAddress, slotIndex, writeReveal, resetReveal]);

  // Reclaim expired commitment
  const reclaim = useCallback((slot: bigint) => {
    if (!isConnected || !address) {
      throw new Error('Wallet not connected');
    }

    writeReveal({
      address: contractAddress,
      abi: BOOA_NFT_ABI,
      functionName: 'reclaimExpired',
      args: [slot],
    });
  }, [isConnected, address, contractAddress, writeReveal]);

  // Determine phase — reveal_failed keeps slotIndex alive for retry
  const hasRevealError = !!(revealWriteError || revealReceiptError);
  const hasCommitError = !!(commitWriteError || commitReceiptError);

  const phase: CommitRevealPhase = isRevealSuccess
    ? 'success'
    : isRevealConfirming || isRevealPending
    ? 'revealing'
    : hasRevealError && slotIndex !== null
    ? 'reveal_failed'
    : isCommitSuccess && slotIndex !== null
    ? 'committed'
    : slotIndex !== null && !isCommitPending && !isCommitConfirming && !hasCommitError && !commitTxHash
    ? 'committed'  // recovered from localStorage
    : isCommitConfirming || isCommitPending
    ? 'committing'
    : hasCommitError
    ? 'error'
    : 'idle';

  const reset = useCallback(() => {
    resetCommit();
    resetReveal();
    setSlotIndex(null);
    clearPendingCommit();
  }, [resetCommit, resetReveal]);

  return {
    commit,
    reveal,
    reclaim,
    phase,
    slotIndex,
    tokenId,
    mintPrice,
    totalSupply,
    maxSupply,
    commitTxHash,
    revealTxHash,
    error: commitWriteError || commitReceiptError || revealWriteError || revealReceiptError,
    reset,
    isConnected,
    address,
    contractAddress,
    chainId,
    refetchSupply,
  };
}
