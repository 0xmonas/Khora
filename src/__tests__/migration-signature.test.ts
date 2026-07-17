import { describe, it, expect } from 'vitest';
import {
  keccak256, concatHex, toHex, padHex, stringToHex,
  recoverMessageAddress, getAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { claimDigest, ETH_MAINNET_CHAIN_ID } from '@/lib/contracts/booa-eth';

// Deterministic throwaway key — NOT a real operator key.
const TEST_KEY = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
const CONTRACT = getAddress('0x1f08c2705280d6e200902a0c1774645f447eb1c4');
const CLAIMER = getAddress('0x9c54a9c609212d2fd034b55cf3b42ba99af52880');

/**
 * Independently reproduce the Solidity packing so we don't just re-call the
 * function under test:
 *   keccak256(abi.encodePacked("BOOA_MIGRATION_v1", chainid, address(this), claimer, tokenId))
 */
function manualDigest(contract: `0x${string}`, claimer: `0x${string}`, tokenId: number, chainId: number) {
  return keccak256(
    concatHex([
      stringToHex('BOOA_MIGRATION_v1'),          // raw utf-8 bytes, no length prefix
      padHex(toHex(BigInt(chainId)), { size: 32 }), // uint256
      contract,                                    // 20-byte address
      claimer,                                     // 20-byte address
      padHex(toHex(BigInt(tokenId)), { size: 32 }), // uint256
    ]),
  );
}

describe('migration claim signature schema', () => {
  it('claimDigest matches an independent abi.encodePacked reproduction', () => {
    for (const tokenId of [0, 1, 976, 3332]) {
      expect(claimDigest(CONTRACT, CLAIMER, tokenId, ETH_MAINNET_CHAIN_ID))
        .toBe(manualDigest(CONTRACT, CLAIMER, tokenId, ETH_MAINNET_CHAIN_ID));
    }
  });

  it('operator EIP-191 signature recovers to the operator (matches contract .recover)', async () => {
    const account = privateKeyToAccount(TEST_KEY);
    const tokenId = 976;
    const digest = claimDigest(CONTRACT, CLAIMER, tokenId, ETH_MAINNET_CHAIN_ID);
    // Mirrors BOOAEth: claimMessage(...).toEthSignedMessageHash() then ECDSA.recover.
    const signature = await account.signMessage({ message: { raw: digest } });
    const recovered = await recoverMessageAddress({ message: { raw: digest }, signature });
    expect(recovered).toBe(account.address);
  });

  it('digest is bound to claimer, tokenId, contract and chainId (no cross-use)', () => {
    const base = claimDigest(CONTRACT, CLAIMER, 976, 1);
    const otherClaimer = claimDigest(CONTRACT, getAddress('0x038b11894253e3e0583267522d364e4ed69c14cb'), 976, 1);
    const otherToken = claimDigest(CONTRACT, CLAIMER, 977, 1);
    const otherContract = claimDigest(getAddress('0xde152afb7db5373f34876e1499fbd893a82dd336'), CLAIMER, 976, 1);
    const otherChain = claimDigest(CONTRACT, CLAIMER, 976, 11155111);
    expect(new Set([base, otherClaimer, otherToken, otherContract, otherChain]).size).toBe(5);
  });
});
