import { verifyMessage } from 'viem';

/**
 * Builds a deterministic message for the pending-reveal API.
 * Must match exactly on client and server side.
 */
export function buildPendingRevealMessage(
  action: 'save' | 'delete',
  address: string,
  chainId: number,
  slot: number,
): string {
  return `BOOA pending-reveal ${action} ${address.toLowerCase()} chain:${chainId} slot:${slot}`;
}

/**
 * Verifies that `signature` was signed by `expectedAddress` for `message`.
 * Returns true if valid, false otherwise.
 */
export async function verifyWalletSignature(
  message: string,
  signature: `0x${string}`,
  expectedAddress: `0x${string}`,
): Promise<boolean> {
  try {
    return await verifyMessage({
      message,
      signature,
      address: expectedAddress,
    });
  } catch {
    return false;
  }
}
