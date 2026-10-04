'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PaintEntry } from '@/lib/booa-palettes';

const font = { fontFamily: 'var(--font-departure-mono)' };
const SIZE = 320;
const CELL = SIZE / 64;

export function PaintCanvas({ grid, mask, bgSlot, palette, paint, cap, disabled, onChange }: {
  grid: Uint8Array; mask: Uint8Array; bgSlot: number; palette: string[]; paint: PaintEntry[]; cap: number; disabled?: boolean;
  onChange: (next: PaintEntry[]) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [slot, setSlot] = useState<number>(() => palette.findIndex((c, i) => i !== bgSlot && c !== palette[bgSlot]));
  const [eraser, setEraser] = useState(false);
  const drawing = useRef(false);

  const swatches = useMemo(() => {
    const seen = new Set<string>();
    const out: { slot: number; color: string }[] = [];
    palette.forEach((c, i) => { if (i === bgSlot || c === palette[bgSlot] || seen.has(c)) return; seen.add(c); out.push({ slot: i, color: c }); });
    return out;
  }, [palette, bgSlot]);

  useEffect(() => {
    if (!swatches.some((s) => s.slot === slot) && swatches.length) setSlot(swatches[0].slot);
  }, [swatches, slot]);

  const byPos = useMemo(() => { const m = new Map<number, number>(); for (const p of paint) m.set(p.pos, p.slot); return m; }, [paint]);

  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    for (let pos = 0; pos < 4096; pos++) {
      const s = byPos.get(pos) ?? grid[pos];
      ctx.fillStyle = `#${palette[s]}`;
      ctx.fillRect((pos & 63) * CELL, (pos >> 6) * CELL, CELL, CELL);
    }
  }, [grid, mask, palette, byPos]);
  const [locked, setLocked] = useState(false);

  const posAt = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - r.left) / r.width) * 64);
    const y = Math.floor(((e.clientY - r.top) / r.height) * 64);
    return x < 0 || x > 63 || y < 0 || y > 63 ? -1 : y * 64 + x;
  };

  const apply = (pos: number) => {
    if (pos < 0 || !mask[pos]) return;
    if (eraser) { if (byPos.has(pos)) onChange(paint.filter((p) => p.pos !== pos)); return; }
    if (byPos.get(pos) === slot) return;
    if (!byPos.has(pos) && paint.length >= cap) return;
    onChange([...paint.filter((p) => p.pos !== pos), { pos, slot }].sort((a, b) => a.pos - b.pos));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground" style={font}>Paint the background</span>
        <span className="text-[10px] text-muted-foreground/60" style={font}>{paint.length}/{cap} px</span>
      </div>
      <canvas ref={ref} width={SIZE} height={SIZE}
        className={`w-full max-w-[320px] aspect-square rounded-md ring-1 ring-neutral-200 dark:ring-neutral-800 touch-none ${disabled ? 'opacity-60' : locked ? 'cursor-not-allowed' : 'cursor-crosshair'}`}
        style={{ imageRendering: 'pixelated' }}
        onPointerDown={(e) => { if (disabled) return; drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId); apply(posAt(e)); }}
        onPointerMove={(e) => { const p = posAt(e); setLocked(p >= 0 && !mask[p]); if (drawing.current && !disabled) apply(p); }}
        onPointerLeave={() => setLocked(false)}
        onPointerUp={() => { drawing.current = false; }}
        onPointerCancel={() => { drawing.current = false; }}
      />
      <div className="flex flex-wrap items-center gap-1">
        {swatches.map((s) => (
          <button key={s.slot} onClick={() => { setEraser(false); setSlot(s.slot); }} title={`#${s.color}`}
            className={`w-6 h-6 rounded-md ring-2 ${!eraser && slot === s.slot ? 'ring-neutral-900 dark:ring-neutral-100' : 'ring-transparent hover:ring-neutral-400'}`}
            style={{ backgroundColor: `#${s.color}` }} />
        ))}
        <button onClick={() => setEraser(true)}
          className={`text-[10px] px-2 py-0.5 rounded-md border ${eraser ? 'border-neutral-900 dark:border-neutral-100 text-foreground' : 'border-neutral-200 dark:border-neutral-800 text-muted-foreground hover:border-neutral-400'}`} style={font}>
          eraser
        </button>
        {paint.length > 0 && (
          <button onClick={() => onChange([])} className="text-[10px] px-2 py-0.5 rounded-md border border-neutral-200 dark:border-neutral-800 text-muted-foreground hover:border-neutral-400" style={font}>
            clear
          </button>
        )}
      </div>
      <p className="text-[10px] text-muted-foreground/60 leading-relaxed" style={font}>
        Only the background can be painted; the figure is locked. Colours are the palette above as it will be saved. Up to as many pixels as the figure has.
      </p>
    </div>
  );
}
