/**
 * Generate Merkle root + per-address proofs from an allowlist.
 *
 * Usage:
 *   npx tsx scripts/generate-merkle.ts
 *
 * Reads:  scripts/allowlist.json   — array of checksummed addresses
 * Writes: public/allowlist-proofs.json — { root, proofs: { [address]: proof[] } }
 *
 * Uses @openzeppelin/merkle-tree with the same double-hash leaf encoding
 * as BOOAMinter.sol: keccak256(bytes.concat(keccak256(abi.encode(address))))
 */

import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const allowlistPath = resolve(__dirname, 'allowlist.json');
const outputPath = resolve(__dirname, '..', 'public', 'allowlist-proofs.json');

const addresses: string[] = JSON.parse(readFileSync(allowlistPath, 'utf-8'));

// StandardMerkleTree expects an array of arrays (each leaf = [address])
// It uses the same double-hash leaf encoding as OpenZeppelin's MerkleProof
const tree = StandardMerkleTree.of(
  addresses.map((addr) => [addr]),
  ['address'],
);

console.log('Merkle Root:', tree.root);
console.log('Allowlist size:', addresses.length);

// Build per-address proof map
const proofs: Record<string, string[]> = {};
const entries = Array.from(tree.entries());
for (const [i, v] of entries) {
  const addr = v[0] as string;
  proofs[addr.toLowerCase()] = tree.getProof(i);
}

const output = {
  root: tree.root,
  proofs,
};

writeFileSync(outputPath, JSON.stringify(output, null, 2));
console.log('Written to:', outputPath);
