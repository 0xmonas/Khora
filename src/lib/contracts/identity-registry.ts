// ERC-8004 Identity Registry — deterministic CREATE2, same address on all chains
import {
  shape, mainnet, base, arbitrum, optimism, polygon,
  avalanche, bsc, celo, gnosis, scroll, linea, mantle, metis, abstract as abstractChain, monad,
} from 'wagmi/chains';

export const IDENTITY_REGISTRY_MAINNET = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432' as const;
export const IDENTITY_REGISTRY_TESTNET = '0x8004A818BFB912233c491871b3d84c89A494BD9e' as const;

/** Testnet chain IDs use the testnet registry — everything else is mainnet */
const TESTNET_IDS = new Set<number>([
  84532, // Base Sepolia
  11011, // Shape Sepolia
]);

export function getRegistryAddress(chainId: number): `0x${string}` {
  if (TESTNET_IDS.has(chainId)) return IDENTITY_REGISTRY_TESTNET;
  return IDENTITY_REGISTRY_MAINNET;
}

export const SUPPORTED_REGISTRY_CHAIN_IDS = new Set<number>([
  shape.id, mainnet.id, base.id, arbitrum.id, optimism.id, polygon.id,
  avalanche.id, bsc.id, celo.id, gnosis.id, scroll.id, linea.id,
  mantle.id, metis.id, abstractChain.id, monad.id,
  ...Array.from(TESTNET_IDS),
]);

export function isSupportedRegistryChain(chainId: number): boolean {
  return SUPPORTED_REGISTRY_CHAIN_IDS.has(chainId);
}

export const IDENTITY_REGISTRY_ABI = [
  {
    type: 'function',
    name: 'register',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'agentURI', type: 'string' }],
    outputs: [{ name: 'agentId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'setAgentURI',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'newURI', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'Registered',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'agentURI', type: 'string', indexed: false },
      { name: 'owner', type: 'address', indexed: true },
    ],
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
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'tokenURI',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'getMetadata',
    stateMutability: 'view',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'metadataKey', type: 'string' },
    ],
    outputs: [{ name: '', type: 'bytes' }],
  },
  // ERC-721 approval surface (registry IS an ERC-721 for agent tokens).
  // Used by the bindExisting flow: holder approves the adapter to take
  // ownership of their existing native agent NFT, then calls adapter.bindExisting.
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'getApproved',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
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
    type: 'function',
    name: 'isApprovedForAll',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'operator', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;
