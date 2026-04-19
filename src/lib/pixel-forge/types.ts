export const DEFAULT_CANVAS_WIDTH = 64;
export const DEFAULT_CANVAS_HEIGHT = 64;
export const MAX_CANVAS_SIZE = 256;
export const MIN_CANVAS_SIZE = 8;

export interface PalettePreset {
  name: string;
  colors: string[];
}

export const PALETTE_PRESETS: PalettePreset[] = [
  {
    name: 'C64',
    colors: [
      '#000000', '#626262', '#898989', '#ADADAD', '#FFFFFF', '#9F4E44',
      '#CB7E75', '#6D5412', '#A1683C', '#C9D487', '#9AE29B', '#5CAB5E',
      '#6ABFC6', '#887ECB', '#50459B', '#A057A3',
    ],
  },
  {
    name: 'GameBoy',
    colors: ['#0F380F', '#306230', '#8BAC0F', '#9BBC0F'],
  },
  {
    name: 'NES',
    colors: [
      '#000000', '#FCFCFC', '#F8F8F8', '#BCBCBC', '#7C7C7C', '#A4E4FC',
      '#3CBCFC', '#0078F8', '#0000FC', '#B8B8F8', '#6888FC', '#0058F8',
      '#0000BC', '#D8B8F8', '#9878F8', '#6844FC', '#4428BC', '#F8B8F8',
      '#F878F8', '#D800CC', '#940084', '#F8A4C0', '#F85898', '#E40058',
      '#A80020', '#F0D0B0', '#F87858', '#F83800', '#A81000', '#FCE0A8',
      '#FCA044', '#E45C10', '#881400', '#F8D878', '#F8B800', '#AC7C00',
      '#503000', '#D8F878', '#B8F818', '#00B800', '#007800', '#B8F8B8',
      '#58D854', '#00A800', '#006800', '#B8F8D8', '#58F898', '#00A844',
      '#005800', '#00FCFC', '#00E8D8', '#008888', '#004058', '#F8D8F8',
      '#787878',
    ],
  },
  {
    name: 'PICO-8',
    colors: [
      '#000000', '#1D2B53', '#7E2553', '#008751', '#AB5236', '#5F574F',
      '#C2C3C7', '#FFF1E8', '#FF004D', '#FFA300', '#FFEC27', '#00E436',
      '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA',
    ],
  },
  {
    name: 'Endesga 32',
    colors: [
      '#BE4A2F', '#D77643', '#EAD4AA', '#E4A672', '#B86F50', '#733E39',
      '#3E2731', '#A22633', '#E43B44', '#F77622', '#FEAE34', '#FEE761',
      '#63C74D', '#3E8948', '#265C42', '#193C3E', '#124E89', '#0099DB',
      '#2CE8F5', '#FFFFFF', '#C0CBDC', '#8B9BB4', '#5A6988', '#3A4466',
      '#262B44', '#181425', '#FF0044', '#68386C', '#B55088', '#F6757A',
      '#E8B796', '#C28569',
    ],
  },
  {
    name: 'Grayscale',
    colors: [
      '#000000', '#111111', '#222222', '#333333', '#444444', '#555555',
      '#666666', '#777777', '#888888', '#999999', '#AAAAAA', '#BBBBBB',
      '#CCCCCC', '#DDDDDD', '#EEEEEE', '#FFFFFF',
    ],
  },
  {
    name: '1-Bit',
    colors: ['#000000', '#FFFFFF'],
  },
  {
    name: 'Full Color',
    colors: [],
  },
];

export const C64_PALETTE: string[] = PALETTE_PRESETS[0].colors;

export enum ToolType {
  PENCIL = 'PENCIL',
  ERASER = 'ERASER',
  EYEDROPPER = 'EYEDROPPER',
  SELECT = 'SELECT',
  MOVE = 'MOVE',
  FILL = 'FILL',
  FILL_SAME = 'FILL_SAME',
  LINE = 'LINE',
  RECTANGLE = 'RECTANGLE',
  CIRCLE = 'CIRCLE',
  CHROMA_KEY = 'CHROMA_KEY',
}

export const CANVAS_PRESETS = [16, 32, 64, 128, 256] as const;

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
