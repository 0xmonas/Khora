// Index == BOOAConfig palette index. 0 is the mint palette. Append only.
export interface BooaPalette { name: string; colors: string[] }

export const BOOA_PALETTES: BooaPalette[] = [
  { name: "C64", colors: ["000000", "626262", "898989", "ADADAD", "FFFFFF", "9F4E44", "CB7E75", "6D5412", "A1683C", "C9D487", "9AE29B", "5CAB5E", "6ABFC6", "887ECB", "50459B", "A057A3"] },
  { name: "PICO-8", colors: ["000000", "5F574F", "83769C", "C2C3C7", "FFF1E8", "FF004D", "FF77A8", "AB5236", "FFA300", "FFEC27", "00E436", "008751", "29ADFF", "FFCCAA", "1D2B53", "7E2553"] },
  { name: "Game Boy", colors: ["0F380F", "0F380F", "306230", "8BAC0F", "9BBC0F", "306230", "8BAC0F", "0F380F", "306230", "9BBC0F", "8BAC0F", "306230", "8BAC0F", "8BAC0F", "0F380F", "306230"] },
  { name: "NES", colors: ["000000", "545454", "7C7C7C", "BCBCBC", "FCFCFC", "A81000", "F87858", "503000", "E45C10", "F8B800", "B8F818", "00A800", "3CBCFC", "6888FC", "0000FC", "940084"] },
  { name: "CGA", colors: ["000000", "555555", "AAAAAA", "AAAAAA", "FFFFFF", "AA0000", "FF5555", "AA5500", "AA5500", "FFFF55", "55FF55", "00AA00", "00AAAA", "55FFFF", "5555FF", "AA00AA"] },
  { name: "Apple II", colors: ["000000", "808080", "808080", "BFABFF", "FFFFFF", "6C2940", "FF96BF", "405400", "D9680F", "BFCA87", "2FBC1A", "0E5940", "6CF0D3", "2F95E5", "403578", "D93CF3"] },
  { name: "Noir", colors: ["000000", "444444", "888888", "CCCCCC", "FFFFFF", "333333", "AAAAAA", "111111", "666666", "EEEEEE", "DDDDDD", "777777", "BBBBBB", "999999", "222222", "555555"] },
  { name: "Amber", colors: ["1A0E00", "573900", "946400", "D19000", "FFB000", "482E00", "B37A00", "291900", "764F00", "F0A500", "E09A00", "855A00", "C28500", "A36F00", "392400", "664400"] },
  { name: "Phosphor", colors: ["001400", "0E530E", "1B911B", "29D029", "33FF33", "0A430A", "22B122", "032403", "147214", "30EF30", "2CE02C", "188218", "25C025", "1FA11F", "073307", "116211"] },
  { name: "Sepia", colors: ["2B1D0F", "61523E", "96876E", "CCBC9D", "F4E4C1", "534533", "B1A286", "382A1B", "7B6D56", "E7D7B5", "D9C9A9", "897A62", "BEAF92", "A4947A", "463827", "6E5F4A"] },
];

export const C64 = BOOA_PALETTES[0].colors;

export function recolorSvg(svg: string, palette: string[]): string {
  let out = svg;
  C64.forEach((c, i) => { out = out.split(`#${c}`).join(`\u0000${i}\u0000`); });
  palette.forEach((c, i) => { out = out.split(`\u0000${i}\u0000`).join(`#${c}`); });
  return out;
}
