import { base, baseSepolia } from 'wagmi/chains';

// ── V2 Contract Addresses ──
// Four separate contracts: BOOA (ERC721), Storage, Renderer, Minter
// User interacts with Minter only. Frontend reads from BOOA (tokenURI, totalSupply).

export const BOOA_V2_ADDRESS = (process.env.NEXT_PUBLIC_BOOA_V2_ADDRESS || '') as `0x${string}`;
export const BOOA_V2_ADDRESS_TESTNET = (process.env.NEXT_PUBLIC_BOOA_V2_ADDRESS_TESTNET || '') as `0x${string}`;
export const BOOA_V2_MINTER_ADDRESS = (process.env.NEXT_PUBLIC_BOOA_V2_MINTER_ADDRESS || '') as `0x${string}`;
export const BOOA_V2_MINTER_ADDRESS_TESTNET = (process.env.NEXT_PUBLIC_BOOA_V2_MINTER_ADDRESS_TESTNET || '') as `0x${string}`;
export const BOOA_V2_STORAGE_ADDRESS = (process.env.NEXT_PUBLIC_BOOA_V2_STORAGE_ADDRESS || '') as `0x${string}`;
export const BOOA_V2_STORAGE_ADDRESS_TESTNET = (process.env.NEXT_PUBLIC_BOOA_V2_STORAGE_ADDRESS_TESTNET || '') as `0x${string}`;
export const BOOA_V2_RENDERER_ADDRESS = (process.env.NEXT_PUBLIC_BOOA_V2_RENDERER_ADDRESS || '') as `0x${string}`;
export const BOOA_V2_RENDERER_ADDRESS_TESTNET = (process.env.NEXT_PUBLIC_BOOA_V2_RENDERER_ADDRESS_TESTNET || '') as `0x${string}`;

const MAINNET_IDS = new Set<number>([base.id]);

export function getV2Address(chainId: number): `0x${string}` {
  if (MAINNET_IDS.has(chainId) && BOOA_V2_ADDRESS.length > 2) return BOOA_V2_ADDRESS;
  return BOOA_V2_ADDRESS_TESTNET;
}

export function getV2MinterAddress(chainId: number): `0x${string}` {
  if (MAINNET_IDS.has(chainId) && BOOA_V2_MINTER_ADDRESS.length > 2) return BOOA_V2_MINTER_ADDRESS;
  return BOOA_V2_MINTER_ADDRESS_TESTNET;
}

export function getV2StorageAddress(chainId: number): `0x${string}` {
  if (MAINNET_IDS.has(chainId) && BOOA_V2_STORAGE_ADDRESS.length > 2) return BOOA_V2_STORAGE_ADDRESS;
  return BOOA_V2_STORAGE_ADDRESS_TESTNET;
}

export function getV2RendererAddress(chainId: number): `0x${string}` {
  if (MAINNET_IDS.has(chainId) && BOOA_V2_RENDERER_ADDRESS.length > 2) return BOOA_V2_RENDERER_ADDRESS;
  return BOOA_V2_RENDERER_ADDRESS_TESTNET;
}

/** V2 chain ID for contract reads (Base Sepolia for testnet fallback) */
export function getV2ChainId(chainId: number): number {
  if (MAINNET_IDS.has(chainId) && BOOA_V2_ADDRESS.length > 2) return base.id;
  return baseSepolia.id;
}

// ── BOOAv2 (ERC721) ABI — read-only functions ──
// NOTE: V2 is NOT ERC721Enumerable — no tokenByIndex/tokenOfOwnerByIndex.
// Token IDs are sequential starting from 0 (via nextTokenId).
export const BOOA_V2_ABI = [
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ name: '', type: 'string' }],
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
    inputs: [{ name: 'owner', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'ownerOf',
    outputs: [{ name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
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
  {
    inputs: [{ name: 'interfaceId', type: 'bytes4' }],
    name: 'supportsInterface',
    outputs: [{ name: '', type: 'bool' }],
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
] as const;

// ── BOOAMinter ABI — mint + read functions ──
export const BOOA_V2_MINTER_ABI = [
  {
    inputs: [
      { name: 'imageData', type: 'bytes' },
      { name: 'traitsData', type: 'bytes' },
      { name: 'deadline', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    name: 'mint',
    outputs: [{ name: 'tokenId', type: 'uint256' }],
    stateMutability: 'payable',
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
  {
    inputs: [],
    name: 'paused',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Events
  {
    type: 'event',
    name: 'AgentMinted',
    inputs: [
      { type: 'uint256', name: 'tokenId', indexed: true },
      { type: 'address', name: 'minter', indexed: true },
    ],
  },
] as const;

// ── BOOAStorage ABI — read functions for Gallery ──
export const BOOA_V2_STORAGE_ABI = [
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getTraits',
    outputs: [{ name: '', type: 'bytes' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'getImageData',
    outputs: [{ name: '', type: 'bytes' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'hasBitmap',
    outputs: [{ name: '', type: 'bool' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

// ── BOOARenderer ABI — SVG rendering ──
export const BOOA_V2_RENDERER_ABI = [
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'tokenURI',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [{ name: 'bitmap', type: 'bytes' }],
    name: 'renderSVG',
    outputs: [{ name: '', type: 'string' }],
    stateMutability: 'pure',
    type: 'function',
  },
] as const;
