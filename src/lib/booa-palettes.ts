// Index == BOOAConfig palette index. 0 is the mint palette. Append only.
export interface BooaPalette { name: string; colors: string[]; hidden?: boolean }

export const BOOA_PALETTES: BooaPalette[] = [
  { name: "C64", colors: ["000000", "626262", "898989", "ADADAD", "FFFFFF", "9F4E44", "CB7E75", "6D5412", "A1683C", "C9D487", "9AE29B", "5CAB5E", "6ABFC6", "887ECB", "50459B", "A057A3"] },
  { name: "PICO-8", colors: ["000000", "5F574F", "83769C", "C2C3C7", "FFF1E8", "FF004D", "FF77A8", "AB5236", "FFA300", "FFEC27", "00E436", "008751", "29ADFF", "FFCCAA", "1D2B53", "7E2553"] },
  { name: "Game Boy", colors: ["081820", "346856", "88C070", "E0F8D0", "E0F8D0", "081820", "88C070", "081820", "346856", "E0F8D0", "E0F8D0", "346856", "88C070", "88C070", "081820", "346856"] },
  { name: "NES", colors: ["000000", "545454", "7C7C7C", "BCBCBC", "FCFCFC", "A81000", "F87858", "503000", "E45C10", "F8B800", "B8F818", "00A800", "3CBCFC", "6888FC", "0000FC", "940084"] },
  { name: "CGA", colors: ["000000", "555555", "AAAAAA", "AAAAAA", "FFFFFF", "AA0000", "FF5555", "AA5500", "AA5500", "FFFF55", "55FF55", "00AA00", "00AAAA", "55FFFF", "5555FF", "AA00AA"] },
  { name: "Apple II", colors: ["000000", "808080", "808080", "BFABFF", "FFFFFF", "6C2940", "FF96BF", "405400", "D9680F", "BFCA87", "2FBC1A", "0E5940", "6CF0D3", "2F95E5", "403578", "D93CF3"] },
  { name: "Noir", colors: ["000000", "444444", "888888", "CCCCCC", "FFFFFF", "333333", "AAAAAA", "111111", "666666", "EEEEEE", "DDDDDD", "777777", "BBBBBB", "999999", "222222", "555555"] },
  { name: "Amber", colors: ["1A0E00", "573900", "946400", "D19000", "FFB000", "482E00", "B37A00", "291900", "764F00", "F0A500", "E09A00", "855A00", "C28500", "A36F00", "392400", "664400"] },
  { name: "Phosphor", colors: ["001400", "0E530E", "1B911B", "29D029", "33FF33", "0A430A", "22B122", "032403", "147214", "30EF30", "2CE02C", "188218", "25C025", "1FA11F", "073307", "116211"] },
  { name: "Sepia", colors: ["2B1D0F", "61523E", "96876E", "CCBC9D", "F4E4C1", "534533", "B1A286", "382A1B", "7B6D56", "E7D7B5", "D9C9A9", "897A62", "BEAF92", "A4947A", "463827", "6E5F4A"] },
  { name: "XCOPY", colors: ["22133D", "7739D1", "E14D9C", "7EC292", "FFFFFF", "7739D1", "7EC292", "22133D", "E14D9C", "FFFFFF", "FFFFFF", "E14D9C", "7EC292", "E14D9C", "22133D", "7739D1"], hidden: true },
  { name: "XCOPY", colors: ["22133D", "22133D", "7EC292", "7EC292", "FFFFFF", "E14D9C", "E14D9C", "22133D", "E14D9C", "7EC292", "7EC292", "7EC292", "7EC292", "7739D1", "7739D1", "E14D9C"] },
];

export const C64 = BOOA_PALETTES[0].colors;

export function recolorSvg(svg: string, palette: string[]): string {
  let out = svg;
  C64.forEach((c, i) => { out = out.split(`#${c}`).join(`\u0000${i}\u0000`); });
  palette.forEach((c, i) => { out = out.split(`\u0000${i}\u0000`).join(`#${c}`); });
  return out;
}

export const LEVELS = [16, 8, 4, 2] as const;
export type Levels = (typeof LEVELS)[number];

const RANK = [0, 4, 8, 12, 15, 3, 10, 1, 6, 14, 13, 7, 11, 9, 2, 5];
const ORDER = [0, 7, 14, 5, 1, 15, 8, 11, 2, 13, 6, 12, 3, 10, 9, 4];

export function posterize(colors: string[], levels: number): string[] {
  if (levels <= 0 || levels >= 16) return colors;
  return colors.map((_, s) => {
    const bucket = Math.floor((RANK[s] * levels) / 16);
    const rep = Math.floor((bucket * 15 + Math.floor((levels - 1) / 2)) / (levels - 1));
    return colors[ORDER[rep]];
  });
}

export const BG_SWATCHES = ['FFFFFF', 'F4E4C1', '1A1A2E', '0F380F', '7739D1', 'E14D9C', 'FFB000', '29ADFF'];

export function applyBackground(svg: string, bg: string): string {
  if (!bg) return svg;
  const rect = svg.match(/<rect fill="#([0-9A-Fa-f]{6})"[^>]*\/>/);
  if (!rect) return svg;
  const bgHex = rect[1].toUpperCase();
  const drawn = new Uint8Array(4096);
  for (const run of svg.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
    const x = +run[1]; const y = +run[2]; const l = +run[3];
    for (let i = 0; i < l; i++) drawn[y * 64 + x + i] = 1;
  }
  const outside = new Uint8Array(4096);
  const stack: number[] = [];
  const visit = (c: number) => { if (drawn[c] || outside[c]) return; outside[c] = 1; stack.push(c); };
  for (let i = 0; i < 64; i++) { visit(i); visit(4032 + i); visit(i * 64); visit(i * 64 + 63); }
  while (stack.length) {
    const c = stack.pop()!; const x = c & 63;
    if (x > 0) visit(c - 1);
    if (x < 63) visit(c + 1);
    if (c >= 64) visit(c - 64);
    if (c < 4032) visit(c + 64);
  }
  let d = '';
  for (let y = 0; y < 64; y++) {
    let x = 0;
    while (x < 64) {
      const c = y * 64 + x;
      if (drawn[c] || outside[c]) { x++; continue; }
      const s = x;
      while (x < 64 && !drawn[y * 64 + x] && !outside[y * 64 + x]) x++;
      d += `M${s} ${y}h${x - s}`;
    }
  }
  const newRect = bg === 'transparent' ? '' : rect[0].replace(/fill="#[0-9A-Fa-f]{6}"/, `fill="#${bg}"`);
  const inner = d ? `<path stroke="#${bgHex}" d="${d}"/>` : '';
  return svg.replace(rect[0], newRect + inner);
}

export function svgToGrid(svg: string): Uint8Array | null {
  const rect = svg.match(/<rect fill="#([0-9A-Fa-f]{6})"[^>]*\/>/);
  if (!rect) return null;
  const bg = C64.indexOf(rect[1].toUpperCase());
  if (bg < 0) return null;
  const grid = new Uint8Array(4096).fill(bg);
  for (const path of svg.matchAll(/<path stroke="#([0-9A-Fa-f]{6})" d="([^"]+)"/g)) {
    const slot = C64.indexOf(path[1].toUpperCase());
    if (slot < 0) return null;
    for (const run of path[2].matchAll(/M(\d+) (\d+)h(\d+)/g)) {
      const x = +run[1]; const y = +run[2]; const l = +run[3];
      for (let i = 0; i < l; i++) grid[y * 64 + x + i] = slot;
    }
  }
  return grid;
}

export function outsideMask(grid: Uint8Array, bgColor: number): Uint8Array {
  const mask = new Uint8Array(4096);
  const stack: number[] = [];
  const visit = (c: number) => { if (mask[c] || grid[c] !== bgColor) return; mask[c] = 1; stack.push(c); };
  for (let i = 0; i < 64; i++) { visit(i); visit(4032 + i); visit(i * 64); visit(i * 64 + 63); }
  while (stack.length) {
    const c = stack.pop()!; const x = c & 63;
    if (x > 0) visit(c - 1);
    if (x < 63) visit(c + 1);
    if (c >= 64) visit(c - 64);
    if (c < 4032) visit(c + 64);
  }
  return mask;
}

export function bgSlot(grid: Uint8Array): number {
  const counts = new Array<number>(16).fill(0);
  for (let i = 0; i < 4096; i++) counts[grid[i]]++;
  let bgColor = 0;
  for (let c = 1; c < 16; c++) if (counts[c] > counts[bgColor]) bgColor = c;
  return bgColor;
}

export interface PaintEntry { pos: number; slot: number }

export function applyPaint(grid: Uint8Array, paint: PaintEntry[], mask: Uint8Array, bgColor: number): Uint8Array {
  const canvas = Uint8Array.from(grid);
  for (const { pos, slot } of paint) {
    if (pos < 0 || pos >= 4096 || !mask[pos] || slot === bgColor || slot < 0 || slot > 15) continue;
    canvas[pos] = slot;
  }
  return canvas;
}

export function renderGrid(grid: Uint8Array, palette: string[], bg: string, paint: PaintEntry[] = []): string {
  const bgColor = bgSlot(grid);
  const painted = paint.length > 0;
  const mask = bg || painted ? outsideMask(grid, bgColor) : null;
  if (painted && mask) grid = applyPaint(grid, paint, mask, bgColor);
  let out = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -0.5 64 64" shape-rendering="crispEdges">';
  if (!bg) out += `<rect fill="#${palette[bgColor]}" y="-0.5" width="64" height="65"/>`;
  else if (bg !== 'transparent') out += `<rect fill="#${bg.toUpperCase()}" y="-0.5" width="64" height="65"/>`;
  const paths = new Array<string>(16).fill('');
  for (let y = 0; y < 64; y++) {
    let x = 0;
    while (x < 64) {
      const color = grid[y * 64 + x];
      if (color === bgColor && (!bg || (mask && mask[y * 64 + x]))) { x++; continue; }
      const start = x; x++;
      while (x < 64 && grid[y * 64 + x] === color && !(color === bgColor && bg && mask && mask[y * 64 + x])) x++;
      paths[color] += `M${start} ${y}h${x - start}`;
    }
  }
  for (let c = 0; c < 16; c++) if (paths[c]) out += `<path stroke="#${palette[c]}" d="${paths[c]}"/>`;
  return out + '</svg>';
}

export function renderPreview(ogSvg: string, palette: string[], bg: string, paint: PaintEntry[] = []): string {
  const grid = svgToGrid(ogSvg);
  if (!grid) return ogSvg;
  return renderGrid(grid, palette, bg, paint);
}

