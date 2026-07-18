import { shape, shapeSepolia, mainnet } from 'wagmi/chains';

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

// ── Ethereum mainnet (post-migration canonical) — same on-chain interface ──
// (ownerOf, totalSupply, getImageData, renderer). No Minter (claim-based migration).
export const BOOA_ETH_ADDRESS = (process.env.NEXT_PUBLIC_BOOA_ETH_ADDRESS || '0xbc48fD45aAaf6549293056606397D351a100b222') as `0x${string}`;
export const BOOA_ETH_STORAGE_ADDRESS = (process.env.NEXT_PUBLIC_BOOA_ETH_STORAGE_ADDRESS || '0xD6A1ECd2495d1ECf6c200E1D8D6a191BF07Cba96') as `0x${string}`;
export const BOOA_ETH_RENDERER_ADDRESS = (process.env.NEXT_PUBLIC_BOOA_ETH_RENDERER_ADDRESS || '0x7Cf376EE7263a78Db2d163775BE322fA7B842C76') as `0x${string}`;

const MAINNET_IDS = new Set<number>([shape.id]);
const isEth = (chainId: number) => chainId === mainnet.id;

export function getV2Address(chainId: number): `0x${string}` {
  if (isEth(chainId)) return BOOA_ETH_ADDRESS;
  if (MAINNET_IDS.has(chainId) && BOOA_V2_ADDRESS.length > 2) return BOOA_V2_ADDRESS;
  return BOOA_V2_ADDRESS_TESTNET;
}

export function getV2MinterAddress(chainId: number): `0x${string}` {
  if (MAINNET_IDS.has(chainId) && BOOA_V2_MINTER_ADDRESS.length > 2) return BOOA_V2_MINTER_ADDRESS;
  return BOOA_V2_MINTER_ADDRESS_TESTNET;
}

export function getV2StorageAddress(chainId: number): `0x${string}` {
  if (isEth(chainId)) return BOOA_ETH_STORAGE_ADDRESS;
  if (MAINNET_IDS.has(chainId) && BOOA_V2_STORAGE_ADDRESS.length > 2) return BOOA_V2_STORAGE_ADDRESS;
  return BOOA_V2_STORAGE_ADDRESS_TESTNET;
}

export function getV2RendererAddress(chainId: number): `0x${string}` {
  if (isEth(chainId)) return BOOA_ETH_RENDERER_ADDRESS;
  if (MAINNET_IDS.has(chainId) && BOOA_V2_RENDERER_ADDRESS.length > 2) return BOOA_V2_RENDERER_ADDRESS;
  return BOOA_V2_RENDERER_ADDRESS_TESTNET;
}

/** Chain ID to read BOOA contracts on, given the connected chain. */
export function getV2ChainId(chainId: number): number {
  if (isEth(chainId)) return mainnet.id;
  if (MAINNET_IDS.has(chainId) && BOOA_V2_ADDRESS.length > 2) return shape.id;
  return shapeSepolia.id;
}

/** Alchemy chain slug for /api/gallery + /api/fetch-nfts, per connected chain. */
export function getBooaChainSlug(chainId: number): 'ethereum' | 'shape' | 'shape-sepolia' {
  if (isEth(chainId)) return 'ethereum';
  if (chainId === shape.id) return 'shape';
  return 'shape-sepolia';
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
  // Write functions
  {
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    name: 'burn',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'imageData', type: 'bytes' },
      { name: 'traitsData', type: 'bytes' },
    ],
    name: 'updateMetadata',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  // Read: totalBurned
  {
    inputs: [],
    name: 'totalBurned',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  // Read: totalMinted
  {
    inputs: [],
    name: 'totalMinted',
    outputs: [{ name: '', type: 'uint256' }],
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
    name: 'MetadataUpdate',
    inputs: [
      { type: 'uint256', name: '_tokenId', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'BatchMetadataUpdate',
    inputs: [
      { type: 'uint256', name: '_fromTokenId', indexed: false },
      { type: 'uint256', name: '_toTokenId', indexed: false },
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
      { name: 'merkleProof', type: 'bytes32[]' },
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
    name: 'currentPhase',
    outputs: [{ name: '', type: 'uint8' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'allowlistPrice',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'publicPrice',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'merkleRoot',
    outputs: [{ name: '', type: 'bytes32' }],
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
    inputs: [{ name: 'addr', type: 'address' }],
    name: 'allowlistMintCount',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [
      { name: 'imageData', type: 'bytes' },
      { name: 'traitsData', type: 'bytes' },
      { name: 'deadline', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    name: 'ownerMint',
    outputs: [{ name: 'tokenId', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'owner',
    outputs: [{ name: '', type: 'address' }],
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
  {
    type: 'event',
    name: 'PhaseUpdated',
    inputs: [
      { type: 'uint8', name: 'newPhase', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'MerkleRootUpdated',
    inputs: [
      { type: 'bytes32', name: 'newRoot', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'AllowlistPriceUpdated',
    inputs: [
      { type: 'uint256', name: 'newPrice', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'PublicPriceUpdated',
    inputs: [
      { type: 'uint256', name: 'newPrice', indexed: false },
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
