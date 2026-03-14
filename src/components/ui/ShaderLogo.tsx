'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { useTheme } from '@/components/providers/theme-provider';

const ASCII_RAMP = '@%#*+=-:. ';
const MOUSE_RADIUS = 100;
const FRAME_INTERVAL = 33;

export function ShaderLogo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const mouseRef = useRef({ x: -1, y: -1 });
  const baseImgRef = useRef<HTMLImageElement | null>(null);
  const colorImgRef = useRef<HTMLImageElement | null>(null); // kept for grid build compatibility
  const [ready, setReady] = useState(0);
  const { theme } = useTheme();

  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const lastFrameRef = useRef(0);
  const staticFrameRef = useRef<ImageData | null>(null);
  const needsStaticRedraw = useRef(true);

  const gridRef = useRef<{
    cols: number;
    rows: number;
    cells: {
      baseCharIdx: number;
      lum: number;
      cr: number; cg: number; cb: number; ca: number;
      ba: number;
      visible: boolean;
    }[];
    cellW: number;
    cellH: number;
  } | null>(null);

  useEffect(() => {
    setReady(0);
    gridRef.current = null;
    staticFrameRef.current = null;
    needsStaticRedraw.current = true;
    let loaded = 0;

    const baseSrc = '/khoralogo.svg';

    const baseImg = new Image();
    baseImg.crossOrigin = 'anonymous';
    baseImg.onload = () => {
      baseImgRef.current = baseImg;
      loaded++;
      if (loaded === 2) setReady(2);
    };
    baseImg.src = baseSrc;

    const colorImg = new Image();
    colorImg.crossOrigin = 'anonymous';
    colorImg.onload = () => {
      colorImgRef.current = colorImg;
      loaded++;
      if (loaded === 2) setReady(2);
    };
    colorImg.src = '/khoralogo.svg';
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || ready < 2 || !baseImgRef.current || !colorImgRef.current) return;

    const offBase = document.createElement('canvas');
    const offColor = document.createElement('canvas');

    function buildGrid(w: number, h: number) {
      if (w < 1 || h < 1) return;
      const base = baseImgRef.current;
      const color = colorImgRef.current;
      if (!base || !color) return;

      const imgAspect = base.naturalWidth / base.naturalHeight;
      const canvasAspect = w / h;
      let dx = 0, dy = 0, dw = w, dh = h;
      if (imgAspect > canvasAspect) {
        dw = w; dh = Math.floor(w / imgAspect);
        dy = Math.floor((h - dh) / 2);
      } else {
        dh = h; dw = Math.floor(h * imgAspect);
        dx = Math.floor((w - dw) / 2);
      }

      offBase.width = w; offBase.height = h;
      const bCtx = offBase.getContext('2d', { willReadFrequently: true });
      if (!bCtx) return;
      bCtx.clearRect(0, 0, w, h);
      bCtx.drawImage(base, dx, dy, dw, dh);
      const baseData = bCtx.getImageData(0, 0, w, h).data;

      offColor.width = w; offColor.height = h;
      const cCtx = offColor.getContext('2d', { willReadFrequently: true });
      if (!cCtx) return;
      cCtx.clearRect(0, 0, w, h);
      cCtx.drawImage(color, dx, dy, dw, dh);
      const colorData = cCtx.getImageData(0, 0, w, h).data;

      const targetCols = Math.max(60, Math.min(200, Math.floor(w / 6)));
      const cellW = w / targetCols;
      const cellH = cellW * 1.8;
      const cols = Math.floor(w / cellW);
      const rows = Math.floor(h / cellH);

      const cells: {
        baseCharIdx: number; lum: number;
        cr: number; cg: number; cb: number; ca: number;
        ba: number; visible: boolean;
      }[] = [];

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const sx = Math.floor(col * cellW + cellW / 2);
          const sy = Math.floor(row * cellH + cellH / 2);
          const idx = (sy * w + sx) * 4;

          const br = baseData[idx] || 0;
          const bg = baseData[idx + 1] || 0;
          const bb = baseData[idx + 2] || 0;
          const ba = baseData[idx + 3] || 0;

          const cr = colorData[idx] || 0;
          const cg = colorData[idx + 1] || 0;
          const cb = colorData[idx + 2] || 0;
          const ca = colorData[idx + 3] || 0;

          const lum = (0.299 * br + 0.587 * bg + 0.114 * bb);

          let baseCharIdx = ASCII_RAMP.length - 1;
          const visible = ba > 20;
          if (visible) {
            const normalized = 1 - (lum / 255);
            baseCharIdx = Math.floor(normalized * (ASCII_RAMP.length - 1));
            baseCharIdx = Math.min(baseCharIdx, ASCII_RAMP.length - 1);
          }

          cells.push({ baseCharIdx, lum, cr, cg, cb, ca, ba, visible });
        }
      }

      gridRef.current = { cols, rows, cells, cellW, cellH };
      staticFrameRef.current = null;
      needsStaticRedraw.current = true;
    }

    const dpr = devicePixelRatio || 1;

    function render(timestamp: number) {
      if (!canvas) return;

      if (timestamp - lastFrameRef.current < FRAME_INTERVAL) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }
      lastFrameRef.current = timestamp;

      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      const w = Math.floor(cw * dpr);
      const h = Math.floor(ch * dpr);

      if (canvas.width !== w || canvas.height !== h || sizeRef.current.w !== w) {
        canvas.width = w;
        canvas.height = h;
        sizeRef.current = { w, h };
        ctxRef.current = null;
        buildGrid(w, h);
      }

      let ctx = ctxRef.current;
      if (!ctx) {
        ctx = canvas.getContext('2d', { alpha: true });
        ctxRef.current = ctx;
      }
      if (!ctx || !gridRef.current) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      const mouseActive = mouseRef.current.x >= 0;

      // No mouse → cached static frame
      if (!mouseActive && staticFrameRef.current && !needsStaticRedraw.current) {
        ctx.putImageData(staticFrameRef.current, 0, 0);
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      const { cols, rows, cells, cellW, cellH } = gridRef.current;
      const radius = MOUSE_RADIUS * dpr;
      const radiusSq = radius * radius;
      const mx = mouseActive ? mouseRef.current.x * dpr : -9999;
      const my = mouseActive ? mouseRef.current.y * dpr : -9999;

      ctx.clearRect(0, 0, w, h);

      const fontSize = Math.max(6, Math.floor(cellH * 0.85));
      ctx.font = `${fontSize}px "DepartureMono", ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const isDark = document.documentElement.classList.contains('dark');
      const rampLen = ASCII_RAMP.length;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cell = cells[row * cols + col];
          if (!cell.visible) continue;

          const cx = col * cellW + cellW / 2;
          const cy = row * cellH + cellH / 2;

          const ddx = cx - mx;
          const ddy = cy - my;
          const distSq = ddx * ddx + ddy * ddy;
          const insideRadius = distSq < radiusSq;

          // Wave ripple inside mouse radius
          let charIdx = cell.baseCharIdx;
          if (insideRadius) {
            const dist = Math.sqrt(distSq);
            const t = 1 - dist / radius;
            // Sine wave based on distance + time → ripple effect
            const wave = Math.sin(dist * 0.08 - timestamp * 0.004) * t;
            const shift = Math.round(wave * 3);
            charIdx = Math.max(0, Math.min(rampLen - 2, charIdx + shift));
          }
          const char = ASCII_RAMP[charIdx];
          if (char === ' ') continue;

          const gray = isDark ? 180 : 80;
          const a = cell.ba / 255;
          ctx.fillStyle = `rgba(${gray},${gray},${gray},${a})`;

          ctx.fillText(char, cx, cy);
        }
      }

      // Cache when mouse is gone
      if (!mouseActive) {
        staticFrameRef.current = ctx.getImageData(0, 0, w, h);
        needsStaticRedraw.current = false;
      }

      rafRef.current = requestAnimationFrame(render);
    }

    buildGrid(
      Math.floor(canvas.clientWidth * dpr),
      Math.floor(canvas.clientHeight * dpr)
    );
    rafRef.current = requestAnimationFrame(render);

    return () => { cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, theme]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const handleMouseLeave = useCallback(() => {
    mouseRef.current = { x: -1, y: -1 };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="absolute inset-0 w-full h-full z-10"
    />
  );
}
