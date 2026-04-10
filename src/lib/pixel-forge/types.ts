export const DEFAULT_CANVAS_WIDTH = 64;
export const DEFAULT_CANVAS_HEIGHT = 64;
export const MAX_CANVAS_SIZE = 128;
export const MIN_CANVAS_SIZE = 8;

// C64 16-color palette — same order as BOOA NFT on-chain bitmap
export const C64_PALETTE: string[] = [
  '#000000', // 0: Black
  '#626262', // 1: Dark Grey
  '#898989', // 2: Grey
  '#ADADAD', // 3: Light Grey
  '#FFFFFF', // 4: White
  '#9F4E44', // 5: Brown-Red
  '#CB7E75', // 6: Salmon
  '#6D5412', // 7: Dark Brown
  '#A1683C', // 8: Orange-Brown
  '#C9D487', // 9: Lime
  '#9AE29B', // 10: Light Green
  '#5CAB5E', // 11: Green
  '#6ABFC6', // 12: Cyan
  '#887ECB', // 13: Purple
  '#50459B', // 14: Dark Purple
  '#A057A3', // 15: Magenta
];

export enum ToolType {
  PENCIL = 'PENCIL',
  ERASER = 'ERASER',
  EYEDROPPER = 'EYEDROPPER',
  SELECT = 'SELECT',
  MOVE = 'MOVE',
  FILL = 'FILL',
  LINE = 'LINE',
  RECTANGLE = 'RECTANGLE',
  CIRCLE = 'CIRCLE',
  CHROMA_KEY = 'CHROMA_KEY',
}

export const CANVAS_PRESETS = [16, 32, 64, 128] as const;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layer {
  id: string;
  name: string;
  data: string | null;
  visible: boolean;
  opacity: number;
  isLocked: boolean;
}

export interface GenerationState {
  isGenerating: boolean;
  error: string | null;
}
