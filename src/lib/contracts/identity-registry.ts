// ERC-8004 Identity Registry — deterministic CREATE2, same address on all chains
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
    name: 'tokenURI',
    stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
  },
] as const;
