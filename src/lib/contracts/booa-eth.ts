import { keccak256, encodePacked, type Hex } from 'viem';

export const ETH_MAINNET_CHAIN_ID = 1;
export const SHAPE_MAINNET_CHAIN_ID = 360;

export const MIGRATION_MAX_SUPPLY = 3333;

// Canonical BOOAEth (Ethereum mainnet, verified). Deployed 2026-07-13, permanent.
// Hardcoded fallback so tools work without the env set; env overrides.
export const BOOA_ETH_ADDRESS = (process.env.NEXT_PUBLIC_BOOA_ETH_ADDRESS || '0xbc48fD45aAaf6549293056606397D351a100b222') as `0x${string}`;
export const BOOA_BURN_HELPER_ADDRESS = (process.env.NEXT_PUBLIC_BOOA_BURN_HELPER_ADDRESS || '') as `0x${string}`;
export const BOOA_SHAPE_ADDRESS = (process.env.NEXT_PUBLIC_BOOA_V2_ADDRESS || '') as `0x${string}`;

function isAddress(a: string): a is `0x${string}` {
  return /^0x[a-fA-F0-9]{40}$/.test(a) && a !== '0x0000000000000000000000000000000000000000';
}

export function getBooaEthAddress(): `0x${string}` | null {
  return isAddress(BOOA_ETH_ADDRESS) ? BOOA_ETH_ADDRESS : null;
}

export function getBurnHelperAddress(): `0x${string}` | null {
  return isAddress(BOOA_BURN_HELPER_ADDRESS) ? BOOA_BURN_HELPER_ADDRESS : null;
}

export function getShapeBooaAddress(): `0x${string}` | null {
  return isAddress(BOOA_SHAPE_ADDRESS) ? BOOA_SHAPE_ADDRESS : null;
}

/**
 * Reproduces `BOOAEth.claimMessage(claimer, tokenId)` exactly:
 * keccak256(abi.encodePacked("BOOA_MIGRATION_v1", block.chainid, address(this), claimer, tokenId)).
 * The operator signs this digest with EIP-191 (viem `signMessage({ message: { raw } })`,
 * which mirrors Solidity's `.toEthSignedMessageHash()`).
 */
export function claimDigest(
  contractAddress: `0x${string}`,
  claimer: `0x${string}`,
  tokenId: number | bigint,
  chainId: number | bigint = ETH_MAINNET_CHAIN_ID,
): Hex {
  return keccak256(
    encodePacked(
      ['string', 'uint256', 'address', 'address', 'uint256'],
      ['BOOA_MIGRATION_v1', BigInt(chainId), contractAddress, claimer, BigInt(tokenId)],
    ),
  );
}

export const BOOA_ETH_ABI = [
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenIds', type: 'uint256[]' },
      { name: 'signatures', type: 'bytes[]' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimed',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'claimsPaused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'operatorSigner',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'MAX_SUPPLY',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'Claimed',
    inputs: [
      { name: 'claimer', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
    ],
  },
] as const;

export const BURN_HELPER_ABI = [
  {
    type: 'function',
    name: 'batchBurn',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenIds', type: 'uint256[]' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'booa',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'event',
    name: 'MigrationBurn',
    inputs: [
      { name: 'holder', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
    ],
  },
] as const;

/** Minimal Shape BOOA surface used by the migration flow. */
export const SHAPE_BOOA_ABI = [
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'burn',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'isApprovedForAll',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'setApprovalForAll',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'operator', type: 'address' },
      { name: 'approved', type: 'bool' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { name: 'from', type: 'address', indexed: true },
      { name: 'to', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: true },
    ],
  },
] as const;
