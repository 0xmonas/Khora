import { privateKeyToAccount } from 'viem/accounts';
import { keccak256, encodePacked, type Hex } from 'viem';

/**
 * Server-side EIP-191 signing for BOOA V2 mint flow.
 *
 * Signs (imageData, traitsData, minterAddress, deadline) so the
 * on-chain BOOAMinter contract can verify authenticity.
 */

let _signer: ReturnType<typeof privateKeyToAccount> | null = null;

function getSigner() {
  if (!_signer) {
    const key = process.env.SIGNER_PRIVATE_KEY;
    if (!key) throw new Error('SIGNER_PRIVATE_KEY not configured');
    _signer = privateKeyToAccount(key as Hex);
  }
  return _signer;
}

/** Returns the signer's public address (for contract constructor). */
export function getSignerAddress(): Hex {
  return getSigner().address;
}

/**
 * Sign a mint packet for the BOOAMinter contract.
 *
 * @param imageData  - 2048-byte bitmap as hex string (0x-prefixed)
 * @param traitsData - Traits JSON as hex string (0x-prefixed)
 * @param minter     - The wallet address that will call mint()
 * @param deadline   - Unix timestamp when signature expires
 * @returns EIP-191 signature (65 bytes, 0x-prefixed)
 */
export async function signMintPacket(
  imageData: Hex,
  traitsData: Hex,
  minter: Hex,
  deadline: bigint,
): Promise<Hex> {
  const signer = getSigner();

  // Must match BOOAMinter.sol: keccak256(abi.encodePacked(imageData, traitsData, msg.sender, deadline))
  const hash = keccak256(
    encodePacked(
      ['bytes', 'bytes', 'address', 'uint256'],
      [imageData, traitsData, minter, deadline],
    ),
  );

  // EIP-191 personal sign — matches .toEthSignedMessageHash() in Solidity
  const signature = await signer.signMessage({
    message: { raw: hash },
  });

  return signature;
}

/**
 * Create a deadline timestamp (current time + duration in seconds).
 */
export function createDeadline(durationSeconds: number = 300): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + durationSeconds);
}
