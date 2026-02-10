'use client';

import {
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useAccount,
  useChainId,
} from 'wagmi';
import { decodeEventLog, toHex } from 'viem';
import { BOOA_NFT_ABI, getContractAddress } from '@/lib/contracts/booa';

export type MintStatus = 'idle' | 'confirming' | 'pending' | 'success' | 'error';

export function useMintAgent() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const contractAddress = getContractAddress(chainId);

  const { data: mintPrice } = useReadContract({
    address: contractAddress,
    abi: BOOA_NFT_ABI,
    functionName: 'mintPrice',
    query: { enabled: !!contractAddress },
  });

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

  // Extract tokenId from receipt logs
  let tokenId: bigint | null = null;
  if (receipt) {
    for (const log of receipt.logs) {
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

  function mint(svgBytes: Uint8Array, traitsBytes: Uint8Array, name: string, description: string) {
    if (!isConnected || !address) {
      throw new Error('Wallet not connected');
    }

    writeContract({
      address: contractAddress,
      abi: BOOA_NFT_ABI,
      functionName: 'mintAgent',
      args: [toHex(svgBytes), toHex(traitsBytes), name, description],
      value: mintPrice ?? BigInt(0),
    });
  }

  const status: MintStatus = isSuccess
    ? 'success'
    : isConfirming
    ? 'pending'
    : isWritePending
    ? 'confirming'
    : writeError || receiptError
    ? 'error'
    : 'idle';

  return {
    mint,
    status,
    txHash,
    tokenId,
    mintPrice,
    error: writeError || receiptError,
    reset: resetWrite,
    isConnected,
    address,
    contractAddress,
    chainId,
  };
}
