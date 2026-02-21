'use client';

import { useState, useCallback } from 'react';
import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useAccount,
  useChainId,
} from 'wagmi';
import { decodeEventLog } from 'viem';
import type { Hex } from 'viem';
import {
  BOOA_V2_ABI,
  BOOA_V2_MINTER_ABI,
  getV2Address,
  getV2MinterAddress,
} from '@/lib/contracts/booa-v2';

export type MintPhase =
  | 'idle'
  | 'generating'   // Server is running AI pipeline + signing
  | 'confirming'    // Waiting for wallet signature
  | 'pending'       // TX submitted, waiting for confirmation
  | 'success'       // TX confirmed, NFT minted
  | 'error';

export interface MintRequestData {
  imageData: Hex;
  traitsData: Hex;
  deadline: string;
  signature: Hex;
  agent: Record<string, unknown>;
  pixelatedImage: string;
  visualTraits: Record<string, string>;
  quotaRemaining: number;
}

export function useMintAgent() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const booaAddress = getV2Address(chainId);
  const minterAddress = getV2MinterAddress(chainId);

  const [mintRequestData, setMintRequestData] = useState<MintRequestData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // Read contract state
  const { data: mintPrice } = useReadContract({
    address: minterAddress,
    abi: BOOA_V2_MINTER_ABI,
    functionName: 'mintPrice',
    query: { enabled: !!minterAddress && minterAddress.length > 2 },
  });

  const { data: totalSupply, refetch: refetchSupply } = useReadContract({
    address: booaAddress,
    abi: BOOA_V2_ABI,
    functionName: 'totalSupply',
    query: { enabled: !!booaAddress && booaAddress.length > 2 },
  });

  const { data: maxSupply } = useReadContract({
    address: minterAddress,
    abi: BOOA_V2_MINTER_ABI,
    functionName: 'maxSupply',
    query: { enabled: !!minterAddress && minterAddress.length > 2 },
  });

  // Write contract (single tx mint)
  const {
    writeContract,
    data: txHash,
    isPending: isWritePending,
    error: writeError,
    reset: resetWrite,
  } = useWriteContract();

  const {
    isLoading: isConfirming,
    isSuccess,
    data: receipt,
    error: receiptError,
  } = useWaitForTransactionReceipt({ hash: txHash });

  // Extract tokenId from Transfer event
  let tokenId: bigint | null = null;
  if (receipt) {
    for (const log of receipt.logs) {
      try {
        const decoded = decodeEventLog({
          abi: BOOA_V2_ABI,
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

  // Step 1: Request server to generate + sign
  const requestMint = useCallback(async (): Promise<MintRequestData | null> => {
    if (!isConnected || !address) {
      setGenerateError('Your wallet is not connected. Please connect your wallet and try again.');
      return null;
    }

    setIsGenerating(true);
    setGenerateError(null);

    try {
      const response = await fetch('/api/mint-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        throw new Error(data.error || `Server error: ${response.status}`);
      }

      const requestData: MintRequestData = {
        imageData: data.imageData,
        traitsData: data.traitsData,
        deadline: data.deadline,
        signature: data.signature,
        agent: data.agent,
        pixelatedImage: data.pixelatedImage,
        visualTraits: data.visualTraits,
        quotaRemaining: data.quotaRemaining,
      };

      setMintRequestData(requestData);
      return requestData;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Something went wrong during generation. Please try again in a moment.';
      setGenerateError(message);
      return null;
    } finally {
      setIsGenerating(false);
    }
  }, [isConnected, address]);

  // Step 2: Send mint tx with signed data
  const sendMintTx = useCallback((data?: MintRequestData) => {
    const packet = data || mintRequestData;
    if (!packet) {
      throw new Error('Mint session not ready. Please try generating again.');
    }
    if (!isConnected || !address) {
      throw new Error('Your wallet is not connected. Please connect your wallet and try again.');
    }

    writeContract({
      address: minterAddress,
      abi: BOOA_V2_MINTER_ABI,
      functionName: 'mint',
      args: [
        packet.imageData,
        packet.traitsData,
        BigInt(packet.deadline),
        packet.signature,
      ],
      value: mintPrice ?? BigInt(0),
    });
  }, [isConnected, address, minterAddress, mintPrice, mintRequestData, writeContract]);

  // Determine phase
  const phase: MintPhase = isSuccess
    ? 'success'
    : isConfirming
    ? 'pending'
    : isWritePending
    ? 'confirming'
    : isGenerating
    ? 'generating'
    : writeError || receiptError || generateError
    ? 'error'
    : 'idle';

  const reset = useCallback(() => {
    resetWrite();
    setMintRequestData(null);
    setGenerateError(null);
    setIsGenerating(false);
  }, [resetWrite]);

  return {
    requestMint,
    sendMintTx,
    reset,
    refetchSupply,
    phase,
    mintRequestData,
    tokenId,
    txHash,
    mintPrice,
    totalSupply,
    maxSupply,
    isConnected,
    address,
    booaAddress,
    minterAddress,
    chainId,
    error: writeError || receiptError || (generateError ? new Error(generateError) : null),
  };
}
