import { privateKeyToAccount } from 'viem/accounts';
import { keccak256, encodeAbiParameters, type Hex } from 'viem';
import { getV2MinterAddress } from '@/lib/contracts/booa-v2';

/**
 * Server-side EIP-191 signing for BOOA V2 mint flow.
 *
 * Signs (imageData, traitsData, minterAddress, deadline, chainId, contractAddress)
 * so the on-chain BOOAMinter contract can verify authenticity.
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
 * @param chainId    - Target chain ID (must match block.chainid on-chain)
 * @returns EIP-191 signature (65 bytes, 0x-prefixed)
 */
export async function signMintPacket(
  imageData: Hex,
  traitsData: Hex,
  minter: Hex,
  deadline: bigint,
  chainId: bigint,
): Promise<Hex> {
  const signer = getSigner();

  const minterContract = getV2MinterAddress(Number(chainId));

  // Must match BOOAMinter.sol: keccak256(abi.encode(imageData, traitsData, msg.sender, deadline, block.chainid, address(this)))
  const hash = keccak256(
    encodeAbiParameters(
      [
        { type: 'bytes' },
        { type: 'bytes' },
        { type: 'address' },
        { type: 'uint256' },
        { type: 'uint256' },
        { type: 'address' },
      ],
      [imageData, traitsData, minter, deadline, chainId, minterContract],
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
export function createDeadline(durationSeconds: number = 600): bigint {
  return BigInt(Math.floor(Date.now() / 1000) + durationSeconds);
}
