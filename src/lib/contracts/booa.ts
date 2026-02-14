import { base, baseSepolia } from 'wagmi/chains';

export const BOOA_NFT_ADDRESS = (process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS || '') as `0x${string}`;
export const BOOA_NFT_ADDRESS_TESTNET = (process.env.NEXT_PUBLIC_BOOA_NFT_ADDRESS_TESTNET || '') as `0x${string}`;

export function getContractAddress(chainId: number): `0x${string}` {
  if (chainId === base.id && BOOA_NFT_ADDRESS.length > 2) return BOOA_NFT_ADDRESS;
  return BOOA_NFT_ADDRESS_TESTNET;
}

/** Returns the chainId where the contract actually lives */
export function getContractChainId(chainId: number): number {
  if (chainId === base.id && BOOA_NFT_ADDRESS.length > 2) return base.id;
  return baseSepolia.id;
}

export const BOOA_NFT_ABI = [
  {
    inputs: [
      { name: 'svgData', type: 'bytes' },
      { name: 'traitsData', type: 'bytes' },
    ],
    name: 'mintAgent',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getSVG',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getTraits',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'mintPrice',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'totalSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'paused',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'maxSupply',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'maxPerWallet',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'addr', type: 'address' }],
    name: 'mintCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // ERC721Enumerable
  {
    inputs: [{ name: 'index', type: 'uint256' }],
    name: 'tokenByIndex',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'index', type: 'uint256' },
    ],
    name: 'tokenOfOwnerByIndex',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // EIP-2981 Royalties
  {
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'salePrice', type: 'uint256' },
    ],
    name: 'royaltyInfo',
    outputs: [
      { name: 'receiver', type: 'address' },
      { name: 'royaltyAmount', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // ERC165
  {
    inputs: [{ name: 'interfaceId', type: 'bytes4' }],
    name: 'supportsInterface',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Commit-Reveal
  {
    inputs: [],
    name: 'commitMint',
    outputs: [{ name: 'slotIndex', type: 'uint256' }],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'slotIndex', type: 'uint256' },
      { name: 'svgData', type: 'bytes' },
      { name: 'traitsData', type: 'bytes' },
    ],
    name: 'revealMint',
    outputs: [{ name: 'tokenId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'slotIndex', type: 'uint256' }],
    name: 'reclaimExpired',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'commitmentCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'slotIndex', type: 'uint256' },
    ],
    name: 'getCommitment',
    outputs: [
      { name: 'timestamp', type: 'uint256' },
      { name: 'revealed', type: 'bool' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
  // Events
  {
    type: 'event',
    name: 'Transfer',
    inputs: [
      { type: 'address', name: 'from', indexed: true },
      { type: 'address', name: 'to', indexed: true },
      { type: 'uint256', name: 'tokenId', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'CommitMint',
    inputs: [
      { type: 'address', name: 'committer', indexed: true },
      { type: 'uint256', name: 'slotIndex', indexed: true },
    ],
  },
] as const;
