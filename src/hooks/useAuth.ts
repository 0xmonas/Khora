import { useAccount, useReadContract } from 'wagmi';
import { shape } from 'wagmi/chains';
import { useSiweStatus } from '@/components/providers/siwe-provider';
import { BOOA_V2_ABI, getV2Address } from '@/lib/contracts/booa-v2';

/**
 * Core auth hook — wallet connection + SIWE status.
 * Use this for any feature that requires sign-in.
 */
export function useAuth() {
  const { address, isConnected } = useAccount();
  const siweStatus = useSiweStatus();
  const isAuthenticated = siweStatus === 'authenticated';

  return {
    address,
    isConnected,
    isAuthenticated,
    siweStatus,
  };
}

/**
 * Holder auth hook — checks BOOA NFT balance on Shape.
 * Use this for any feature gated to BOOA holders.
 */
export function useHolderAuth(minBalance = 1) {
  const auth = useAuth();
  const contractAddress = getV2Address(shape.id);

  const { data: balance, isLoading: balanceLoading } = useReadContract({
    address: contractAddress,
    abi: BOOA_V2_ABI,
    functionName: 'balanceOf',
    args: auth.address ? [auth.address] : undefined,
    chainId: shape.id,
    query: { enabled: !!auth.address && contractAddress.length > 2 },
  });

  const holdingCount = balance ? Number(balance) : 0;
  const isHolder = holdingCount >= minBalance;

  return {
    ...auth,
    holdingCount,
    isHolder,
    balanceLoading,
  };
}
