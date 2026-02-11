/**
 * SVG minification utilities for on-chain SSTORE2 storage.
 * Reduces SVG byte size by ~15-20% through whitespace removal
 * and color code shortening.
 */

/**
 * Shortens 6-digit hex (#RRGGBB) to 3-digit (#RGB) when possible.
 * e.g. #AABBCC → #ABC, #AABBCD stays as #AABBCD
 */
function shortenHex(hex: string): string {
  if (hex.length !== 7) return hex;
  if (hex[1] === hex[2] && hex[3] === hex[4] && hex[5] === hex[6]) {
    return `#${hex[1]}${hex[3]}${hex[5]}`;
  }
  return hex;
}

/**
 * Minifies SVG string for minimal on-chain byte usage.
 *
 * Optimizations applied:
 * 1. Remove newlines
 * 2. Collapse multiple whitespace
 * 3. Remove whitespace between tags
 * 4. Shorten hex colors (#RRGGBB → #RGB)
 * 5. Remove space before self-closing />
 */
export function minifySVG(svg: string): string {
  let result = svg;

  // Remove newlines
  result = result.replace(/\n/g, '');

  // Collapse multiple spaces
  result = result.replace(/\s{2,}/g, ' ');

  // Remove spaces between > and <
  result = result.replace(/>\s+</g, '><');

  // Shorten hex colors
  result = result.replace(/#([0-9a-fA-F]{6})\b/g, (match) => shortenHex(match));

  // Remove space before />
  result = result.replace(/\s\/>/g, '/>');

  // Trim
  result = result.trim();

  return result;
}

/**
 * Converts SVG string to bytes for contract call.
 * Returns Uint8Array suitable for passing as `bytes` to Solidity.
 */
export function svgToBytes(svg: string): Uint8Array {
  return new TextEncoder().encode(svg);
}

/**
 * Returns the byte size of an SVG string.
 */
export function svgByteSize(svg: string): number {
  return new TextEncoder().encode(svg).length;
}

/** SSTORE2 maximum data size per pointer (24KB) */
export const SSTORE2_MAX_BYTES = 24576;

/**
 * Tags the contract rejects (UnsafeSVG revert).
 * Used for pre-reveal client-side validation.
 */
const UNSAFE_SVG_TAGS = [
  'script', 'style', 'iframe', 'object', 'embed',
  'foreignobject', 'feimage', 'animate', 'image',
];

/**
 * Sanitizes cached SVG bytes: converts <style>-based class strokes
 * to inline stroke attributes, removing the <style> block entirely.
 *
 * Old SVG format: <style>.c0{stroke:#0A0A0A}</style> ... <path class="c0" d="..."/>
 * New SVG format: <path stroke="#0A0A0A" d="..."/>
 */
export function sanitizeSvgBytes(bytes: Uint8Array): Uint8Array {
  const svg = new TextDecoder().decode(bytes);

  // No <style> tag → already clean
  if (!svg.includes('<style>')) return bytes;

  // Extract class→color mappings from <style> block
  const styleMatch = svg.match(/<style>([\s\S]*?)<\/style>/);
  if (!styleMatch) return bytes;

  const colorMap: Record<string, string> = {};
  const classRegex = /\.(c\d+)\{stroke:(#[0-9a-fA-F]{3,6})\}/g;
  let m;
  while ((m = classRegex.exec(styleMatch[1])) !== null) {
    colorMap[m[1]] = m[2];
  }

  // Remove the <style>...</style> block
  let cleaned = svg.replace(/<style>[\s\S]*?<\/style>/, '');

  // Replace class="cN" with stroke="COLOR" on each path
  cleaned = cleaned.replace(/class="(c\d+)"/g, (_, cls) => {
    return colorMap[cls] ? `stroke="${colorMap[cls]}"` : '';
  });

  return new TextEncoder().encode(cleaned);
}

/**
 * Validates SVG string against the contract's safety rules.
 * Returns null if valid, or an error message if it would be rejected.
 */
export function validateSvgForContract(bytes: Uint8Array): string | null {
  const svg = new TextDecoder().decode(bytes).toLowerCase();
  for (const tag of UNSAFE_SVG_TAGS) {
    if (svg.includes(`<${tag}`)) {
      return `SVG contains <${tag}> which the contract rejects. Please regenerate.`;
    }
  }
  return null;
}
