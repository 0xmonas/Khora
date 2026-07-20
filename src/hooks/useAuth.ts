import { useAccount, useReadContract } from 'wagmi';
import { shape, mainnet } from 'wagmi/chains';
import { useSiweStatus } from '@/components/providers/siwe-provider';
import { BOOA_V2_ABI, getV2Address } from '@/lib/contracts/booa-v2';

/**
 * Core auth hook — wallet connection + SIWE status.
 * Use this for any feature that requires sign-in.
 */
export function useAuth() {
  const { address, isConnected, status } = useAccount();
  const siweStatus = useSiweStatus();
  const isAuthenticated = siweStatus === 'authenticated';

  return {
    address,
    isConnected,
    isAuthenticated,
    siweStatus,
    walletStatus: status,
  };
}

/**
 * Holder auth hook — checks BOOA NFT balance across both homes: the Ethereum
 * collection (canonical post-migration) and the Shape collection (origin, still
 * valid until every holder has migrated). Holding on either side counts.
 * When the migration is fully wound down, drop the Shape read and keep Ethereum.
 */
export function useHolderAuth(minBalance = 1) {
  const auth = useAuth();
  const safeMin = Math.max(1, Math.floor(Number.isFinite(minBalance) ? minBalance : 1));

  const ethAddress = getV2Address(mainnet.id);
  const shapeAddress = getV2Address(shape.id);

  const {
    data: ethBalance,
    isLoading: ethLoading,
    error: ethError,
    refetch: refetchEth,
  } = useReadContract({
    address: ethAddress,
    abi: BOOA_V2_ABI,
    functionName: 'balanceOf',
    args: auth.address ? [auth.address] : undefined,
    chainId: mainnet.id,
    query: { enabled: !!auth.address && ethAddress.length > 2 },
  });

  const {
    data: shapeBalance,
    isLoading: shapeLoading,
    error: shapeError,
    refetch: refetchShape,
  } = useReadContract({
    address: shapeAddress,
    abi: BOOA_V2_ABI,
    functionName: 'balanceOf',
    args: auth.address ? [auth.address] : undefined,
    chainId: shape.id,
    query: { enabled: !!auth.address && shapeAddress.length > 2 },
  });

  const holdingCount = (ethBalance ? Number(ethBalance) : 0) + (shapeBalance ? Number(shapeBalance) : 0);
  const isHolder = holdingCount >= safeMin;

  const stillLoading = ethLoading || shapeLoading;
  const anyError = !!ethError || !!shapeError;

  return {
    ...auth,
    holdingCount,
    isHolder,
    // Stop waiting the moment enough balance is confirmed on either chain.
    balanceLoading: stillLoading && !isHolder,
    // Surface an error only if we could not confirm a holder and a read failed —
    // a real holder on the erroring chain gets a retry, not a false lockout.
    balanceError: !isHolder && !stillLoading && anyError ? (ethError || shapeError) : null,
    refetchBalance: () => { refetchEth(); refetchShape(); },
  };
}
