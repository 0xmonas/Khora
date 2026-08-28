import { keccak256, toBytes } from 'viem';

export interface PendingApproval {
  id: string;
  action: Record<string, string>;
  action_hash: string;
  token_id: number;
  chain_id: number;
  nonce: string;
  created_at: number;
  deadline: number;
  status: string;
  signer?: string | null;
}

// Mirrors Python json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=False).
// Action values are strings only, so there is no number-formatting divergence.
function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortDeep);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>).sort().map((k) => [k, sortDeep((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

export function canonicalAction(action: Record<string, string>): string {
  return JSON.stringify(sortDeep(action));
}

// Computed locally from the action the holder actually sees — signing the
// instance-reported hash would let a compromised instance swap the action.
export function actionHash(action: Record<string, string>): `0x${string}` {
  return keccak256(toBytes(canonicalAction(action)));
}

export const APPROVAL_TYPES = {
  ConsoleApproval: [
    { name: 'tokenId', type: 'uint256' },
    { name: 'actionHash', type: 'bytes32' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export function approvalTypedData(a: PendingApproval) {
  return {
    domain: { name: 'BOOA Console', version: '1', chainId: BigInt(a.chain_id) },
    types: APPROVAL_TYPES,
    primaryType: 'ConsoleApproval' as const,
    message: {
      tokenId: BigInt(a.token_id),
      actionHash: actionHash(a.action),
      nonce: BigInt(a.nonce),
      deadline: BigInt(a.deadline),
    },
  };
}

export function describeAction(action: Record<string, string>): string {
  const { tool, ...rest } = action;
  const detail = Object.entries(rest)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${k}: ${v.length > 42 ? `${v.slice(0, 10)}…${v.slice(-6)}` : v}`)
    .join(' · ');
  return detail ? `${tool} — ${detail}` : tool;
}
