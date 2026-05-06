// Sprite Shop — type definitions shared by pipeline + UI.

export type Provider = 'gemini' | 'openai' | 'replicate';

export type CellSize = 32 | 48 | 64 | 96 | 128;

export const ALLOWED_CELL_SIZES: CellSize[] = [32, 48, 64, 96, 128];
export const DEFAULT_CELL_SIZE: CellSize = 96;
export const ATLAS_COLS = 6;
export const ATLAS_ROWS = 8;

export interface RowSpec {
  row: number;
  state: string;
  frames: number;
  durations_ms: number[];
}

// Default top-down RPG row layout when using the default reference
// (`/sprite-shop/reference-default.png`). Mirrors booa-sprite's atlas-spec.md.
export const DEFAULT_ROW_MAP: RowSpec[] = [
  { row: 0, state: 'idle_south',  frames: 6, durations_ms: [280, 110, 110, 140, 140, 320] },
  { row: 1, state: 'walk_south',  frames: 6, durations_ms: [120, 120, 120, 120, 120, 220] },
  { row: 2, state: 'walk_west',   frames: 6, durations_ms: [120, 120, 120, 120, 120, 220] },
  { row: 3, state: 'walk_east',   frames: 6, durations_ms: [120, 120, 120, 120, 120, 220] },
  { row: 4, state: 'walk_north',  frames: 6, durations_ms: [120, 120, 120, 120, 120, 220] },
  { row: 5, state: 'idle_north',  frames: 6, durations_ms: [280, 110, 110, 140, 140, 320] },
  { row: 6, state: 'pose_a',      frames: 6, durations_ms: [200, 200, 200, 200, 200, 200] },
  { row: 7, state: 'pose_b',      frames: 6, durations_ms: [200, 200, 200, 200, 200, 200] },
];

export type RGB = [number, number, number];

// BOOA City C64 16-color palette. Mirrors src/lib/city/assets.ts BOOA_CITY_PALETTE.
export const BOOA_C64_PALETTE: RGB[] = [
  [0x00, 0x00, 0x00], // black
  [0xff, 0xff, 0xff], // white
  [0x88, 0x39, 0x32], // red
  [0x67, 0xb6, 0xbd], // cyan
  [0x8b, 0x3f, 0x96], // purple
  [0x55, 0xa0, 0x49], // green
  [0x40, 0x31, 0x8d], // blue
  [0xbf, 0xce, 0x72], // yellow
  [0x8b, 0x54, 0x29], // orange
  [0x57, 0x42, 0x00], // brown
  [0xb8, 0x69, 0x62], // light-red
  [0x50, 0x50, 0x50], // dark-gray
  [0x78, 0x78, 0x78], // gray
  [0x94, 0xe0, 0x89], // light-green
  [0x78, 0x69, 0xc4], // light-blue
  [0x9f, 0x9f, 0x9f], // light-gray
];

export interface PipelineSettings {
  cellSize: CellSize;
  cols: number;
  rows: number;
  chromaKey: RGB;        // default [0, 255, 0]
  chromaTolerance: number; // linear euclidean, default 96
  paletteMode: 'avatar+c64' | 'avatar' | 'c64';
  cellMethod: 'auto' | 'components' | 'slots';
  cellAnchor: 'bottom' | 'center';
}

export const DEFAULT_PIPELINE_SETTINGS: PipelineSettings = {
  cellSize: DEFAULT_CELL_SIZE,
  cols: ATLAS_COLS,
  rows: ATLAS_ROWS,
  chromaKey: [0, 255, 0],
  chromaTolerance: 96,
  paletteMode: 'avatar+c64',
  cellMethod: 'auto',
  cellAnchor: 'bottom',
};

export interface SpriteShopJob {
  tokenId: string;          // BOOA token id (or 'custom' if user uploaded)
  chainId: number;          // 360 for Shape mainnet
  avatarDataUrl: string;    // BOOA avatar PNG as data URL
  referenceDataUrl: string; // sprite sheet template (default or user upload)
  provider: Provider;
  apiKey: string;           // BYOK
  rowMap: RowSpec[];
  settings: PipelineSettings;
}

export interface PipelineResult {
  atlasDataUrl: string;          // final atlas PNG
  cells: { state: string; col: number; dataUrl: string }[];
  rowGifBlobs: { state: string; blob: Blob }[];
  contactSheetDataUrl: string;
  paletteSize: number;
  identityOverlap: number;       // 0-1, how many opaque pixels are within tolerance of avatar palette
  methodUsedPerRow: Record<string, 'components' | 'slot'>;
}

export interface ProviderInfo {
  id: Provider;
  label: string;
  description: string;
  costHint: string;
  envKeyName: string;
}

export const PROVIDERS: ProviderInfo[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    description: 'Gemini 3 Pro Image, client-side direct',
    costHint: '~$0.10–0.15/atlas',
    envKeyName: 'gemini-api-key',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'gpt-image-2, client-side direct',
    costHint: '~$0.05–0.10/atlas',
    envKeyName: 'openai-api-key',
  },
  {
    id: 'replicate',
    label: 'Replicate (Retro Diffusion)',
    description: 'RD-Plus, server proxy (BYOK forwarded)',
    costHint: '~$0.03–0.08/atlas',
    envKeyName: 'replicate-api-token',
  },
];

export const DEFAULT_REFERENCE_URL = '/sprite-shop/reference-default.png';
