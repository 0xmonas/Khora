import type { Hex } from 'viem';

interface AllowlistData {
  root: string;
  proofs: Record<string, string[]>;
}

let cached: AllowlistData | null = null;

async function loadAllowlistData(): Promise<AllowlistData | null> {
  if (cached) return cached;
  try {
    const res = await fetch('/allowlist-proofs.json');
    if (!res.ok) return null;
    cached = await res.json();
    return cached;
  } catch {
    return null;
  }
}

/**
 * Get the Merkle proof for an address, or null if not allowlisted.
 */
export async function getAllowlistProof(address: string): Promise<Hex[] | null> {
  const data = await loadAllowlistData();
  if (!data) return null;
  const proof = data.proofs[address.toLowerCase()];
  if (!proof || proof.length === 0) return null;
  return proof as Hex[];
}

/**
 * Check if an address is on the allowlist.
 */
export async function isAllowlisted(address: string): Promise<boolean> {
  const proof = await getAllowlistProof(address);
  return proof !== null;
}
