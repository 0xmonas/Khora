export type Provider = 'gemini' | 'openai' | 'replicate';

export type CellSize = 32 | 48 | 64 | 96 | 128;

export const ALLOWED_CELL_SIZES: CellSize[] = [32, 48, 64, 96, 128];
export const DEFAULT_CELL_SIZE: CellSize = 96;
export const ATLAS_COLS = 6;
export const ATLAS_ROWS = 8;
export const MIN_GRID_DIM = 1;
export const MAX_GRID_DIM = 16;

export interface RowSpec {
  row: number;
  state: string;
  frames: number;
  durations_ms: number[];
}

export function buildGenericRowMap(cols: number, rows: number): RowSpec[] {
  return Array.from({ length: rows }, (_, i) => ({
    row: i,
    state: `row_${i}`,
    frames: cols,
    durations_ms: Array(cols).fill(120),
  }));
}

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

// Mirrors BOOA_CITY_PALETTE in src/lib/city/assets.ts.
export const BOOA_C64_PALETTE: RGB[] = [
  [0x00, 0x00, 0x00],
  [0xff, 0xff, 0xff],
  [0x88, 0x39, 0x32],
  [0x67, 0xb6, 0xbd],
  [0x8b, 0x3f, 0x96],
  [0x55, 0xa0, 0x49],
  [0x40, 0x31, 0x8d],
  [0xbf, 0xce, 0x72],
  [0x8b, 0x54, 0x29],
  [0x57, 0x42, 0x00],
  [0xb8, 0x69, 0x62],
  [0x50, 0x50, 0x50],
  [0x78, 0x78, 0x78],
  [0x94, 0xe0, 0x89],
  [0x78, 0x69, 0xc4],
  [0x9f, 0x9f, 0x9f],
];

export interface PipelineSettings {
  cellSize: CellSize;
  cols: number;
  rows: number;
  chromaKey: RGB;
  chromaTolerance: number;
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

export interface SpriteworksJob {
  tokenId: string;
  chainId: number;
  avatarDataUrl: string;
  referenceDataUrl?: string;
  provider: Provider;
  apiKey: string;
  rowMap: RowSpec[];
  settings: PipelineSettings;
  skipExtension?: boolean;
  customLayoutDescription?: string;
}

export interface SpritePreset {
  id: string;
  label: string;
  cols: number;
  rows: number;
  description: string;
  // Sent to AI as the layout description; never shown in the UI textarea.
  internalPrompt: string;
  defaultReferenceMode: 'default' | 'none';
  // When set, rowMap honors per-row frame counts instead of a uniform cols×rows.
  rowSpec?: { state: string; frames: number; durations_ms?: number[] }[];
}

export const SPRITE_PRESETS: SpritePreset[] = [
  {
    id: 'rpg-default',
    label: 'RPG default — 6×8',
    cols: 6,
    rows: 8,
    description: 'idle + 4-direction walk (matches default reference)',
    internalPrompt: '',
    defaultReferenceMode: 'default',
  },
  {
    id: 'idle',
    label: 'Idle — 4×1',
    cols: 4,
    rows: 1,
    description: 'breathing/blinking loop',
    defaultReferenceMode: 'none',
    rowSpec: [{ state: 'idle', frames: 4 }],
    internalPrompt:
`Single row, 4 frames of an idle loop. Character stands facing the camera (south), weight evenly distributed on both feet, arms relaxed at the sides. Frames cycle through a subtle breathing motion: rest (0) → slight inhale, chest expands a hair (1) → peak inhale, shoulders lifted slightly (2) → exhale back toward rest (3). Head stays mostly still; eyes may blink on one frame. Loop wraps cleanly: frame 0 reads continuous with frame 3.`,
  },
  {
    id: 'walk-south',
    label: 'Walk south — 6×1',
    cols: 6,
    rows: 1,
    description: 'walk cycle facing camera',
    defaultReferenceMode: 'none',
    rowSpec: [{ state: 'walk_south', frames: 6 }],
    internalPrompt:
`Single row, 6 frames of a walk cycle facing the camera (south, towards viewer). Standard alternating step: frame 0 left foot heel-strikes forward, frame 1 left foot mid-stance with body weight passing over it, frame 2 right foot lifts and swings forward, frame 3 right foot heel-strikes, frame 4 right foot mid-stance, frame 5 left foot lifts and swings forward. Arms swing opposite to legs. Head bobs slightly. Frame 0 reads continuous with frame 5 for clean looping.`,
  },
  {
    id: 'walk-north',
    label: 'Walk north — 6×1',
    cols: 6,
    rows: 1,
    description: 'walk cycle facing away',
    defaultReferenceMode: 'none',
    rowSpec: [{ state: 'walk_north', frames: 6 }],
    internalPrompt:
`Single row, 6 frames of a walk cycle facing away from the camera (north, back to viewer). Standard alternating step over 6 frames: heel-strike, mid-stance, push-off, opposite heel-strike, opposite mid-stance, opposite push-off. Arms swing opposite to legs. Frame 0 reads continuous with frame 5 for clean looping.`,
  },
  {
    id: 'walk-east',
    label: 'Walk east — 6×1',
    cols: 6,
    rows: 1,
    description: 'walk cycle in profile, facing right',
    defaultReferenceMode: 'none',
    rowSpec: [{ state: 'walk_east', frames: 6 }],
    internalPrompt:
`Single row, 6 frames of a walk cycle in side profile, facing right (east). Show a clear silhouette: legs scissor visibly, the rear leg passes through and forward each step. Frame 0 right heel-strikes forward, frame 1 right mid-stance, frame 2 left lifts and passes, frame 3 left heel-strikes forward, frame 4 left mid-stance, frame 5 right lifts and passes. Arms swing opposite to legs in clear profile. Frame 0 reads continuous with frame 5.`,
  },
  {
    id: 'walk-west',
    label: 'Walk west — 6×1',
    cols: 6,
    rows: 1,
    description: 'walk cycle in profile, facing left',
    defaultReferenceMode: 'none',
    rowSpec: [{ state: 'walk_west', frames: 6 }],
    internalPrompt:
`Single row, 6 frames of a walk cycle in side profile, facing left (west). Mirror of the east-facing walk: legs scissor visibly, rear leg passes through forward each step. 6-frame standard cycle with arms swinging opposite to legs. Frame 0 reads continuous with frame 5.`,
  },
  {
    id: 'run',
    label: 'Run — 8×1',
    cols: 8,
    rows: 1,
    description: 'full run cycle in profile',
    defaultReferenceMode: 'none',
    rowSpec: [{ state: 'run', frames: 8 }],
    internalPrompt:
`Single row, 8 frames of a full run cycle in side profile, facing right (east). Larger stride than a walk, both feet leave the ground briefly between steps, more vertical bounce, arms pumping with bent elbows. Frame 0 right heel-strikes, frame 1 right mid-stance, frame 2 right push-off (airborne), frame 3 left reaches forward (airborne), frame 4 left heel-strikes, frame 5 left mid-stance, frame 6 left push-off (airborne), frame 7 right reaches forward (airborne). Frame 0 reads continuous with frame 7.`,
  },
  {
    id: 'jump',
    label: 'Jump — 7×1',
    cols: 7,
    rows: 1,
    description: 'anticipation → peak → land',
    defaultReferenceMode: 'none',
    rowSpec: [{ state: 'jump', frames: 7 }],
    internalPrompt:
`Single row, 7 frames of a jump arc. Frame 0 anticipation crouch (knees bent, weight low). Frame 1 lift-off push (legs extending, body launching upward). Frame 2 rise (mid-air, body leaning slightly forward, arms up). Frame 3 peak airborne (highest point, body fully extended). Frame 4 descent (falling, arms come down to brace). Frame 5 landing impact (knees bent absorbing impact). Frame 6 settle back to neutral standing.`,
  },
  {
    id: 'fall',
    label: 'Fall — 3×1',
    cols: 3,
    rows: 1,
    description: 'mid-air falling poses',
    defaultReferenceMode: 'none',
    rowSpec: [{ state: 'fall', frames: 3 }],
    internalPrompt:
`Single row, 3 frames of falling mid-air. Frame 0 body angled forward, arms reaching up, hair/clothes blown upward by relative wind. Frame 1 body more vertical, limbs flailing slightly. Frame 2 body curling protectively, arms bracing for impact. Loop or hold based on game state.`,
  },
  {
    id: 'attack',
    label: 'Attack — 7×1',
    cols: 7,
    rows: 1,
    description: 'weapon swing arc',
    defaultReferenceMode: 'none',
    rowSpec: [{ state: 'attack', frames: 7 }],
    internalPrompt:
`Single row, 7 frames of a melee attack swing. Frame 0 ready stance. Frame 1 windup — weapon/fist drawn back, weight on rear foot. Frame 2 forward step initiating the swing. Frame 3 peak strike (weapon at fullest extension, motion strongest). Frame 4 follow-through past the target. Frame 5 recovery — weight returns to neutral. Frame 6 back to ready stance. The swing should read clearly as a single committed motion.`,
  },
  {
    id: 'dodge',
    label: 'Dodge / Roll — 6×1',
    cols: 6,
    rows: 1,
    description: 'forward roll',
    defaultReferenceMode: 'none',
    rowSpec: [{ state: 'dodge', frames: 6 }],
    internalPrompt:
`Single row, 6 frames of a forward dodge roll. Frame 0 tuck — body crouches and tips forward. Frame 1 launch into roll (head tucked, body curling). Frame 2 mid-roll (upside down or fully curled). Frame 3 completing the roll (legs coming back under). Frame 4 recover — character pops up to a low crouch. Frame 5 back to upright stance. Roll travels rightward across the cell visually.`,
  },
  {
    id: 'hurt',
    label: 'Hurt — 4×1',
    cols: 4,
    rows: 1,
    description: 'hit reaction and recovery',
    defaultReferenceMode: 'none',
    rowSpec: [{ state: 'hurt', frames: 4 }],
    internalPrompt:
`Single row, 4 frames of a hit reaction. Frame 0 impact — body recoils, head jerks back, arms jolt outward. Frame 1 stagger — body tips backward, weight off-balance. Frame 2 brace — character catches themselves, plants a foot. Frame 3 recovery — back to upright neutral stance.`,
  },
  {
    id: 'death',
    label: 'Death — 5×1',
    cols: 5,
    rows: 1,
    description: 'defeat sequence',
    defaultReferenceMode: 'none',
    rowSpec: [{ state: 'death', frames: 5 }],
    internalPrompt:
`Single row, 5 frames of a defeat sequence. Frame 0 critical hit reaction (head back, arms wide). Frame 1 knees buckle, body slumps. Frame 2 falling forward, body losing structure. Frame 3 hitting the ground, limbs splayed. Frame 4 final motionless pose lying on the ground. Final frame is the held "defeated" state.`,
  },
  {
    id: 'climb',
    label: 'Climb — 6×1',
    cols: 6,
    rows: 1,
    description: 'ladder / rope climb cycle',
    defaultReferenceMode: 'none',
    rowSpec: [{ state: 'climb', frames: 6 }],
    internalPrompt:
`Single row, 6 frames of climbing a ladder or rope, character facing away (back to camera). Alternating hand grips and foot placements, body inching upward each frame. Frame 0 left hand high, right foot up. Frame 1 transition. Frame 2 right hand high, left foot up. Frame 3 transition. Frame 4 left hand high again (one full cycle). Frame 5 transition back to frame 0 pose for clean loop.`,
  },
  {
    id: 'push-pull',
    label: 'Push / Pull — 6×1',
    cols: 6,
    rows: 1,
    description: 'pushing a heavy object',
    defaultReferenceMode: 'none',
    rowSpec: [{ state: 'push_pull', frames: 6 }],
    internalPrompt:
`Single row, 6 frames of pushing or pulling a heavy unseen object (rightward). Character leans forward into resistance, arms outstretched at chest height as if pressing against something. Standard alternating step cycle (slow, effortful) with the body angled forward. 6 frames forming one clean push step cycle that loops.`,
  },
  {
    id: 'custom',
    label: 'Custom',
    cols: 6,
    rows: 8,
    description: 'you define cols, rows, and full description',
    defaultReferenceMode: 'none',
    internalPrompt: '',
  },
];

export const DEFAULT_PRESET_ID = 'rpg-default';

// Wide strips (8×1, 10×1) distort under image-AI models. Pick a square-ish gen
// grid with cols ≥ rows; the orchestrator rearranges frames into the user's
// strip after extraction.
export function pickGenerationGrid(frames: number): { cols: number; rows: number } {
  if (frames <= 1) return { cols: 1, rows: 1 };
  let best: { cols: number; rows: number; score: number } | null = null;
  const limit = Math.ceil(Math.sqrt(frames));
  for (let rows = 1; rows <= limit; rows++) {
    const cols = Math.ceil(frames / rows);
    if (cols < rows) continue;
    const total = cols * rows;
    const aspect = cols / rows;
    const waste = total - frames;
    const score = aspect * 10 + waste;
    if (!best || score < best.score) best = { cols, rows, score };
  }
  return best ? { cols: best.cols, rows: best.rows } : { cols: frames, rows: 1 };
}

export function rowMapFromPreset(preset: SpritePreset): RowSpec[] {
  if (preset.rowSpec) {
    return preset.rowSpec.map((spec, i) => ({
      row: i,
      state: spec.state,
      frames: spec.frames,
      durations_ms: spec.durations_ms ?? Array(spec.frames).fill(120),
    }));
  }
  return buildGenericRowMap(preset.cols, preset.rows);
}

export interface PipelineResult {
  atlasDataUrl: string;
  cells: { state: string; col: number; dataUrl: string }[];
  rowGifBlobs: { state: string; blob: Blob }[];
  contactSheetDataUrl: string;
  paletteSize: number;
  identityOverlap: number;
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

export const DEFAULT_REFERENCE_URL = '/spriteworks/reference-default.png';
