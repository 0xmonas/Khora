import { mainnet } from 'wagmi/chains';
import type { PaintEntry } from '@/lib/booa-palettes';

export const BOOA_PAINT_ABI = [
  {
    type: 'function', name: 'setPaint', stateMutability: 'nonpayable',
    inputs: [{ name: 'tokenId', type: 'uint256' }, { name: 'agentId', type: 'uint32' }, { name: 'paint', type: 'bytes' }],
    outputs: [],
  },
  { type: 'function', name: 'clearPaint', stateMutability: 'nonpayable', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [] },
  {
    type: 'function', name: 'getPaint', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: 'paint', type: 'bytes' }, { name: 'active', type: 'bool' }],
  },
  {
    type: 'function', name: 'paintable', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: 'mask', type: 'bytes' }, { name: 'bgColor', type: 'uint8' }, { name: 'cap', type: 'uint256' }],
  },
  {
    type: 'function', name: 'raw', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: 'c', type: 'tuple', components: [{ name: 'setBy', type: 'address' }, { name: 'ptr', type: 'address' }] }],
  },
  { type: 'function', name: 'paintFlag', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'bool' }] },
] as const;

export function getBooaPaintAddress(chainId: number = mainnet.id): `0x${string}` | null {
  if (chainId !== mainnet.id) return null;
  const a = process.env.NEXT_PUBLIC_BOOA_PAINT_ADDRESS;
  return a && /^0x[0-9a-fA-F]{40}$/.test(a) && !/^0x0+$/.test(a) ? (a as `0x${string}`) : null;
}

export function encodePaint(entries: PaintEntry[]): `0x${string}` {
  const sorted = [...entries].sort((a, b) => a.pos - b.pos);
  let hex = '0x';
  for (const { pos, slot } of sorted) hex += (((pos << 4) | slot) & 0xffff).toString(16).padStart(4, '0');
  return hex as `0x${string}`;
}

export function decodePaint(hex: string): PaintEntry[] {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  const out: PaintEntry[] = [];
  for (let i = 0; i + 4 <= h.length; i += 4) {
    const v = parseInt(h.slice(i, i + 4), 16);
    out.push({ pos: v >> 4, slot: v & 15 });
  }
  return out;
}
