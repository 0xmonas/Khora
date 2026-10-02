import { mainnet } from 'wagmi/chains';

export const OVERRIDE_COMPONENTS = [
  { name: 'version', type: 'uint8' },
  { name: 'palette', type: 'uint8' },
  { name: 'levels', type: 'uint8' },
  { name: 'agentId', type: 'uint32' },
  { name: 'bg', type: 'uint32' },
  { name: 'keep', type: 'uint8' },
  { name: 'vibe', type: 'string' },
  { name: 'personality', type: 'uint16[]' },
  { name: 'boundaries', type: 'uint16[]' },
  { name: 'skills', type: 'uint16[]' },
  { name: 'domains', type: 'uint16[]' },
] as const;

export const BOOA_CONFIG_ABI = [
  {
    type: 'function', name: 'setConfig', stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenId', type: 'uint256' },
      { name: 'o', type: 'tuple', components: OVERRIDE_COMPONENTS },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'raw', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [{ name: 'c', type: 'tuple', components: [{ name: 'setBy', type: 'address' }, { name: 'ptr', type: 'address' }] }],
  },
  { type: 'function', name: 'contentFlag', stateMutability: 'view', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'clearConfig', stateMutability: 'nonpayable', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [] },
  {
    type: 'function', name: 'getConfig', stateMutability: 'view',
    inputs: [{ name: 'tokenId', type: 'uint256' }],
    outputs: [
      { name: 'o', type: 'tuple', components: OVERRIDE_COMPONENTS },
      { name: 'active', type: 'bool' },
    ],
  },
] as const;

export const LIMITS = { personality: 6, boundaries: 5, skills: 80, domains: 80, vibeBytes: 200 } as const;
export const KEEP = { personality: 1, boundaries: 2, skills: 4, domains: 8 } as const;

export function getBooaConfigAddress(chainId: number = mainnet.id): `0x${string}` | null {
  if (chainId !== mainnet.id) return null;
  const a = process.env.NEXT_PUBLIC_BOOA_CONFIG_ADDRESS;
  return a && /^0x[0-9a-fA-F]{40}$/.test(a) && !/^0x0+$/.test(a) ? (a as `0x${string}`) : null;
}

export function vibeError(v: string): string | null {
  const bytes = new TextEncoder().encode(v).length;
  if (bytes > LIMITS.vibeBytes) return `${bytes}/${LIMITS.vibeBytes} bytes`;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\u2028\u2029]/.test(v)) return 'Line breaks and control characters are not allowed';
  return null;
}

export const BG_TRANSPARENT = 0x2000000;

export function encodeBg(bg: string): number {
  if (!bg) return 0;
  if (bg === 'transparent') return BG_TRANSPARENT;
  return 0x1000000 | parseInt(bg, 16);
}

export function decodeBg(v: number): string {
  if (!v) return '';
  if (v === BG_TRANSPARENT) return 'transparent';
  return (v & 0xffffff).toString(16).toUpperCase().padStart(6, '0');
}
