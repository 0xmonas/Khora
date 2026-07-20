import { shape, shapeSepolia, mainnet, base } from 'wagmi/chains';

// Adapter8004 (v0.0.6 surface) — canonical ERC-8217 reference implementation
// from github.com/nxt3d/adapter-nxt3d, behind per-chain UUPS proxies (NOT
// CREATE2 deterministic). Premm's Ethereum + Base deployments are Safe-owned
// (multisig 0x03302Df40186D9B85faEA4fbb6cC5da028B23149), audited (Pashov +
// Trail of Bits), and point at the canonical ERC-8004 registry. These are the
// public canonical proxy addresses; env vars override per chain if needed.
// Shape has no canonical adapter yet; Sepolia is our own test fixture.
const CANONICAL_ADAPTERS: Record<number, string> = {
  [mainnet.id]: process.env.NEXT_PUBLIC_BOOA_ADAPTER_ADDRESS_ETH || '0xde152AfB7db5373F34876E1499fbD893A82dD336',
  [base.id]: process.env.NEXT_PUBLIC_BOOA_ADAPTER_ADDRESS_BASE || '0x270d25D2c59A8bcA1B0f40ad95fF7806c0025c27',
  [shape.id]: process.env.NEXT_PUBLIC_BOOA_ADAPTER_ADDRESS || '',
  [shapeSepolia.id]: process.env.NEXT_PUBLIC_BOOA_ADAPTER_ADDRESS_TESTNET || '0xC1C6290413ADc62efedC2642C51BC7F261Ab7685',
};

// Backward-compat exports (Shape-focused labels kept as app-level names).
export const BOOA_ADAPTER_ADDRESS = CANONICAL_ADAPTERS[shape.id] as `0x${string}`;
export const BOOA_ADAPTER_ADDRESS_TESTNET = CANONICAL_ADAPTERS[shapeSepolia.id] as `0x${string}`;

export function getAdapterAddress(chainId: number): `0x${string}` | null {
  const a = CANONICAL_ADAPTERS[chainId];
  return a && a.length > 2 ? (a as `0x${string}`) : null;
}

/** True when the chain has a live canonical adapter (binding available). */
export function isBindingChain(chainId: number): boolean {
  return getAdapterAddress(chainId) !== null;
}

/** Chain ids where binding is currently live, for UI listing/flagging. */
export function bindingChainIds(): number[] {
  return [mainnet.id, base.id, shapeSepolia.id].filter((id) => getAdapterAddress(id) !== null);
}

// ── Token standard enum (matches IERCAgentBindings.TokenStandard) ──
export const TOKEN_STANDARD_ERC721 = 0 as const;
export const TOKEN_STANDARD_ERC1155 = 1 as const;
export const TOKEN_STANDARD_ERC6909 = 2 as const;

// ── Reserved metadata keys (ERC-8217) ──
// These keys cannot be written through adapter.setMetadata / setMetadataBatch
// (would revert with ReservedMetadataKey). agent-binding is reserved on both
// the canonical and counterfactual surfaces; cf-registration is reserved
// only on the counterfactual surface.
export const BINDING_METADATA_KEY = 'agent-binding' as const;
export const CF_REGISTRATION_METADATA_KEY = 'cf-registration' as const;

// ── Counterfactual payload version (stamped into counterfactual events) ──
export const COUNTERFACTUAL_PAYLOAD_VERSION = 1 as const;

export const BOOA_ADAPTER_ABI = [
  // ─────────────────────────────────────────────────────────────────
  // Canonical (on-chain) registration surface
  // ─────────────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'register',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'standard', type: 'uint8' },
      { name: 'tokenContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'agentURI', type: 'string' },
    ],
    outputs: [{ name: 'agentId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'register',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'standard', type: 'uint8' },
      { name: 'tokenContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
      { name: 'agentURI', type: 'string' },
      {
        name: 'metadata',
        type: 'tuple[]',
        components: [
          { name: 'metadataKey', type: 'string' },
          { name: 'metadataValue', type: 'bytes' },
        ],
      },
    ],
    outputs: [{ name: 'agentId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'bindExisting',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'standard', type: 'uint8' },
      { name: 'tokenContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [],
  },
  // ─────────────────────────────────────────────────────────────────
  // Canonical (on-chain) controller-gated mutations
  // ─────────────────────────────────────────────────────────────────
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
    type: 'function',
    name: 'setMetadata',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'metadataKey', type: 'string' },
      { name: 'metadataValue', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setMetadataBatch',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      {
        name: 'metadata',
        type: 'tuple[]',
        components: [
          { name: 'metadataKey', type: 'string' },
          { name: 'metadataValue', type: 'bytes' },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'setAgentWallet',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'newWallet', type: 'address' },
      { name: 'deadline', type: 'uint256' },
      { name: 'signature', type: 'bytes' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'unsetAgentWallet',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [],
  },
  // ─────────────────────────────────────────────────────────────────
  // Views
  // ─────────────────────────────────────────────────────────────────
  {
    type: 'function',
    name: 'bindingOf',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [
      {
        name: 'binding',
        type: 'tuple',
        components: [
          { name: 'standard', type: 'uint8' },
          { name: 'tokenContract', type: 'address' },
          { name: 'tokenId', type: 'uint256' },
        ],
      },
    ],
  },
  {
    type: 'function',
    name: 'isController',
    stateMutability: 'view',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ name: '', type: 'bool' }],
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
  {
    type: 'function',
    name: 'getAgentWallet',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'ownerOf',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'tokenURI',
    stateMutability: 'view',
    inputs: [{ name: 'agentId', type: 'uint256' }],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'registrationHash',
    stateMutability: 'view',
    inputs: [
      { name: 'standard', type: 'uint8' },
      { name: 'tokenContract', type: 'address' },
      { name: 'tokenId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bytes32' }],
  },
  {
    type: 'function',
    name: 'counterfactualPayloadVersion',
    stateMutability: 'pure',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'identityRegistry',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  // ─────────────────────────────────────────────────────────────────
  // Events
  // ─────────────────────────────────────────────────────────────────
  {
    type: 'event',
    name: 'AgentBound',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'standard', type: 'uint8', indexed: true },
      { name: 'tokenContract', type: 'address', indexed: true },
      { name: 'tokenId', type: 'uint256', indexed: false },
      { name: 'registeredBy', type: 'address', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'AgentURISet',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'newURI', type: 'string', indexed: false },
      { name: 'updatedBy', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'AgentWalletSet',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'newWallet', type: 'address', indexed: true },
      { name: 'updatedBy', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'AgentWalletUnset',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'updatedBy', type: 'address', indexed: true },
    ],
  },
  {
    type: 'event',
    name: 'MetadataSet',
    inputs: [
      { name: 'agentId', type: 'uint256', indexed: true },
      { name: 'metadataKey', type: 'string', indexed: false },
      { name: 'metadataValue', type: 'bytes', indexed: false },
      { name: 'updatedBy', type: 'address', indexed: true },
    ],
  },
  // ─────────────────────────────────────────────────────────────────
  // Errors (for decode-friendly UI messages)
  // ─────────────────────────────────────────────────────────────────
  { type: 'error', name: 'InvalidTokenContract', inputs: [] },
  { type: 'error', name: 'InvalidTokenContractIsRegistry', inputs: [] },
  { type: 'error', name: 'ReservedMetadataKey', inputs: [{ name: 'metadataKey', type: 'string' }] },
  {
    type: 'error',
    name: 'NotController',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'agentId', type: 'uint256' },
    ],
  },
  { type: 'error', name: 'UnknownAgent', inputs: [{ name: 'agentId', type: 'uint256' }] },
  { type: 'error', name: 'AlreadyBound', inputs: [{ name: 'agentId', type: 'uint256' }] },
  {
    type: 'error',
    name: 'NotAgentOwner',
    inputs: [
      { name: 'agentId', type: 'uint256' },
      { name: 'owner', type: 'address' },
    ],
  },
  { type: 'error', name: 'AgentTransferNotApproved', inputs: [{ name: 'agentId', type: 'uint256' }] },
] as const;
