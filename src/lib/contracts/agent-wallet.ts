// Agent wallet linking (ERC-8217 / Adapter8004).
//
// A BOOA runtime (e.g. the Hermes template) registers its own operating wallet
// as the agent's onchain wallet via `adapter.setAgentWallet(agentId, newWallet,
// deadline, signature)`. The signature is an EIP-712 consent from `newWallet`
// itself — the identity registry recovers the signer and requires it to equal
// the new wallet, so nobody can point an agent at a wallet they don't control.
//
// For adapter-bound agents `owner` is the ADAPTER address (that's what
// `ownerOf(agentId)` returns onchain), and the holder submits the tx through the
// adapter, which is authorized as the controller.

import { recoverTypedDataAddress } from 'viem';

export const AGENT_WALLET_DOMAIN_NAME = 'ERC8004IdentityRegistry';
export const AGENT_WALLET_DOMAIN_VERSION = '1';

export const AGENT_WALLET_SET_TYPES = {
  AgentWalletSet: [
    { name: 'agentId', type: 'uint256' },
    { name: 'newWallet', type: 'address' },
    { name: 'owner', type: 'address' },
    { name: 'deadline', type: 'uint256' },
  ],
} as const;

export interface AgentWalletTypedDataParams {
  chainId: number;
  registry: `0x${string}`;   // EIP-712 verifyingContract is the identity registry, not the adapter
  agentId: bigint;
  newWallet: `0x${string}`;  // the agent's operating (OWS) wallet — must sign this
  owner: `0x${string}`;      // ownerOf(agentId): the adapter address for bound agents
  deadline: bigint;
}

export function buildAgentWalletTypedData(p: AgentWalletTypedDataParams) {
  return {
    domain: {
      name: AGENT_WALLET_DOMAIN_NAME,
      version: AGENT_WALLET_DOMAIN_VERSION,
      chainId: p.chainId,
      verifyingContract: p.registry,
    },
    types: AGENT_WALLET_SET_TYPES,
    primaryType: 'AgentWalletSet' as const,
    message: {
      agentId: p.agentId,
      newWallet: p.newWallet,
      owner: p.owner,
      deadline: p.deadline,
    },
  } as const;
}

// Copy-paste payload the runtime hands to the holder. The holder pastes it into
// the Bridge, which submits setAgentWallet with their (controller) wallet.
export interface AgentWalletBlob {
  v: 1;
  chainId: number;
  agentId: string;   // stringified bigint
  wallet: `0x${string}`;
  deadline: string;  // stringified unix seconds
  signature: `0x${string}`;
}

const ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
const HEX_RE = /^0x[a-fA-F0-9]+$/;

export function encodeAgentWalletBlob(b: AgentWalletBlob): string {
  // JSON is pure ASCII (hex + digits) so Latin-1 base64 is safe in browser + node.
  return btoa(JSON.stringify(b));
}

export function decodeAgentWalletBlob(input: string): AgentWalletBlob | null {
  try {
    const parsed = JSON.parse(atob(input.trim())) as Record<string, unknown>;
    if (parsed.v !== 1) return null;
    if (typeof parsed.chainId !== 'number' || !Number.isInteger(parsed.chainId)) return null;
    if (typeof parsed.wallet !== 'string' || !ADDR_RE.test(parsed.wallet)) return null;
    if (typeof parsed.signature !== 'string' || !HEX_RE.test(parsed.signature)) return null;
    if (typeof parsed.agentId !== 'string' || typeof parsed.deadline !== 'string') return null;
    // Throws if not a valid integer string.
    BigInt(parsed.agentId);
    BigInt(parsed.deadline);
    return {
      v: 1,
      chainId: parsed.chainId,
      agentId: parsed.agentId,
      wallet: parsed.wallet as `0x${string}`,
      deadline: parsed.deadline,
      signature: parsed.signature as `0x${string}`,
    };
  } catch {
    return null;
  }
}

/**
 * Recover the signer of a link code and check it is the wallet the code asks to bind.
 *
 * The registry performs this check on-chain, but doing it locally lets the UI show the
 * holder a verified address BEFORE they sign. Returns 'ok' when the signature is a
 * plain EOA consent from `blob.wallet`, 'mismatch' when it recovers to someone else,
 * and 'unrecoverable' when no address can be recovered — which is also the expected
 * result for an ERC-1271 smart-contract wallet, so callers should warn rather than
 * hard-fail on it.
 */
export async function checkAgentWalletBlobSignature(
  blob: AgentWalletBlob,
  registry: `0x${string}`,
  owner: `0x${string}`,
): Promise<'ok' | 'mismatch' | 'unrecoverable'> {
  try {
    const recovered = await recoverTypedDataAddress({
      ...buildAgentWalletTypedData({
        chainId: blob.chainId,
        registry,
        agentId: BigInt(blob.agentId),
        newWallet: blob.wallet,
        owner,
        deadline: BigInt(blob.deadline),
      }),
      signature: blob.signature,
    });
    return recovered.toLowerCase() === blob.wallet.toLowerCase() ? 'ok' : 'mismatch';
  } catch {
    return 'unrecoverable';
  }
}
