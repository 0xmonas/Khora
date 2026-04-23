declare module 'gifenc' {
  export interface GIFEncoderInstance {
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: {
        palette?: number[][];
        delay?: number;
        transparent?: boolean;
        transparentIndex?: number;
        repeat?: number;
        dispose?: number;
      },
    ): void;
    finish(): void;
    bytes(): Uint8Array;
  }

  export function GIFEncoder(): GIFEncoderInstance;
  export type GifencFormat = 'rgba4444' | 'rgb444' | 'rgb565';
  export function quantize(
    rgba: Uint8ClampedArray,
    maxColors: number,
    opts?: { format?: GifencFormat; oneBitAlpha?: boolean; clearAlpha?: boolean; clearAlphaThreshold?: number },
  ): number[][];
  export function applyPalette(
    rgba: Uint8ClampedArray,
    palette: number[][],
    format?: GifencFormat,
  ): Uint8Array;
}
