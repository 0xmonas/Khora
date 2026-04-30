'use client';

import { useRef, useEffect, useCallback } from 'react';

const ASCII_RAMP = '@%#*+=-:. ';
const MOUSE_RADIUS = 100;
const FRAME_INTERVAL = 33;

interface ShaderLogoProps {
  src?: string;
  type?: 'image' | 'video';
}

export function ShaderLogo({ src = '/booalogo.svg', type = 'image' }: ShaderLogoProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const mouseRef = useRef({ x: -1, y: -1 });
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const lastFrameRef = useRef(0);

  // For image mode — static grid cache
  const staticFrameRef = useRef<ImageData | null>(null);
  const needsStaticRedraw = useRef(true);
  const gridRef = useRef<{
    cols: number;
    rows: number;
    cells: {
      baseCharIdx: number;
      lum: number;
      ba: number;
      visible: boolean;
    }[];
    cellW: number;
    cellH: number;
  } | null>(null);

  // For video mode
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  // Image mode setup
  useEffect(() => {
    if (type !== 'image') return;

    gridRef.current = null;
    staticFrameRef.current = null;
    needsStaticRedraw.current = true;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = devicePixelRatio || 1;
      const w = Math.floor(canvas.clientWidth * dpr);
      const h = Math.floor(canvas.clientHeight * dpr);
      buildImageGrid(img, w, h);
      startImageLoop();
    };
    img.src = src;

    return () => { cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, type]);

  // Video mode setup
  useEffect(() => {
    if (type !== 'video') return;

    const video = document.createElement('video');
    video.src = src;
    video.crossOrigin = 'anonymous';
    video.autoplay = true;
    video.loop = true;
    video.muted = true;
    video.playsInline = true;
    videoRef.current = video;

    offscreenRef.current = document.createElement('canvas');

    video.addEventListener('canplay', () => {
      video.play();
      startVideoLoop();
    });

    return () => {
      cancelAnimationFrame(rafRef.current);
      video.pause();
      video.src = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, type]);

  function buildImageGrid(img: HTMLImageElement, w: number, h: number) {
    if (w < 1 || h < 1) return;

    const offBase = document.createElement('canvas');
    offBase.width = w; offBase.height = h;
    const bCtx = offBase.getContext('2d', { willReadFrequently: true });
    if (!bCtx) return;

    const imgAspect = img.naturalWidth / img.naturalHeight;
    const canvasAspect = w / h;
    let dx = 0, dy = 0, dw = w, dh = h;
    if (imgAspect > canvasAspect) {
      dw = w; dh = Math.floor(w / imgAspect);
      dy = Math.floor((h - dh) / 2);
    } else {
      dh = h; dw = Math.floor(h * imgAspect);
      dx = Math.floor((w - dw) / 2);
    }

    bCtx.clearRect(0, 0, w, h);
    bCtx.drawImage(img, dx, dy, dw, dh);
    const baseData = bCtx.getImageData(0, 0, w, h).data;

    const targetCols = Math.max(60, Math.min(200, Math.floor(w / 6)));
    const cellW = w / targetCols;
    const cellH = cellW * 1.8;
    const cols = Math.floor(w / cellW);
    const rows = Math.floor(h / cellH);

    const cells: { baseCharIdx: number; lum: number; ba: number; visible: boolean }[] = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const sx = Math.floor(col * cellW + cellW / 2);
        const sy = Math.floor(row * cellH + cellH / 2);
        const idx = (sy * w + sx) * 4;

        const br = baseData[idx] || 0;
        const bg = baseData[idx + 1] || 0;
        const bb = baseData[idx + 2] || 0;
        const ba = baseData[idx + 3] || 0;

        const lum = 0.299 * br + 0.587 * bg + 0.114 * bb;

        let baseCharIdx = ASCII_RAMP.length - 1;
        const visible = ba > 20;
        if (visible) {
          const normalized = 1 - lum / 255;
          baseCharIdx = Math.min(Math.floor(normalized * (ASCII_RAMP.length - 1)), ASCII_RAMP.length - 1);
        }

        cells.push({ baseCharIdx, lum, ba, visible });
      }
    }

    gridRef.current = { cols, rows, cells, cellW, cellH };
    staticFrameRef.current = null;
    needsStaticRedraw.current = true;
  }

  function startImageLoop() {
    const canvas = canvasRef.current;
    if (!canvas) return;
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
        // Would need image ref to rebuild — skip for now, initial build covers it
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

          let charIdx = cell.baseCharIdx;
          if (insideRadius) {
            const dist = Math.sqrt(distSq);
            const t = 1 - dist / radius;
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

      if (!mouseActive) {
        staticFrameRef.current = ctx.getImageData(0, 0, w, h);
        needsStaticRedraw.current = false;
      }

      rafRef.current = requestAnimationFrame(render);
    }

    rafRef.current = requestAnimationFrame(render);
  }

  function startVideoLoop() {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    const offscreen = offscreenRef.current;
    if (!canvas || !video || !offscreen) return;
    const dpr = devicePixelRatio || 1;

    function render(timestamp: number) {
      if (!canvas || !video || !offscreen) return;
      if (timestamp - lastFrameRef.current < FRAME_INTERVAL) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }
      lastFrameRef.current = timestamp;

      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      const w = Math.floor(cw * dpr);
      const h = Math.floor(ch * dpr);

      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
        sizeRef.current = { w, h };
        ctxRef.current = null;
      }

      let ctx = ctxRef.current;
      if (!ctx) {
        ctx = canvas.getContext('2d', { alpha: true });
        ctxRef.current = ctx;
      }
      if (!ctx || video.readyState < 2) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      // Draw video to offscreen canvas and sample pixels
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw === 0 || vh === 0) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      // Fit video into canvas (contain)
      const imgAspect = vw / vh;
      const canvasAspect = w / h;
      let dx = 0, dy = 0, dw = w, dh = h;
      if (imgAspect > canvasAspect) {
        dw = w; dh = Math.floor(w / imgAspect);
        dy = Math.floor((h - dh) / 2);
      } else {
        dh = h; dw = Math.floor(h * imgAspect);
        dx = Math.floor((w - dw) / 2);
      }

      offscreen.width = w;
      offscreen.height = h;
      const offCtx = offscreen.getContext('2d', { willReadFrequently: true });
      if (!offCtx) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }
      offCtx.clearRect(0, 0, w, h);
      offCtx.drawImage(video, dx, dy, dw, dh);
      const frameData = offCtx.getImageData(0, 0, w, h).data;

      // Build ASCII grid from current frame
      const targetCols = Math.max(60, Math.min(200, Math.floor(w / 6)));
      const cellW = w / targetCols;
      const cellH = cellW * 1.8;
      const cols = Math.floor(w / cellW);
      const rows = Math.floor(h / cellH);

      ctx.clearRect(0, 0, w, h);

      const fontSize = Math.max(6, Math.floor(cellH * 0.85));
      ctx.font = `${fontSize}px "DepartureMono", ui-monospace, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const isDark = document.documentElement.classList.contains('dark');
      const rampLen = ASCII_RAMP.length;

      const mouseActive = mouseRef.current.x >= 0;
      const radius = MOUSE_RADIUS * dpr;
      const radiusSq = radius * radius;
      const mx = mouseActive ? mouseRef.current.x * dpr : -9999;
      const my = mouseActive ? mouseRef.current.y * dpr : -9999;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const sx = Math.floor(col * cellW + cellW / 2);
          const sy = Math.floor(row * cellH + cellH / 2);
          const idx = (sy * w + sx) * 4;

          const r = frameData[idx] || 0;
          const g = frameData[idx + 1] || 0;
          const b = frameData[idx + 2] || 0;
          const a = frameData[idx + 3] || 0;

          if (a < 20) continue;

          const lum = 0.299 * r + 0.587 * g + 0.114 * b;

          // Skip near-black pixels (video black background)
          if (lum < 30) continue;
          const normalized = 1 - lum / 255;
          let charIdx = Math.min(Math.floor(normalized * (rampLen - 1)), rampLen - 1);

          // Mouse ripple
          const cx = col * cellW + cellW / 2;
          const cy = row * cellH + cellH / 2;
          const ddx = cx - mx;
          const ddy = cy - my;
          const distSq = ddx * ddx + ddy * ddy;

          if (distSq < radiusSq) {
            const dist = Math.sqrt(distSq);
            const t = 1 - dist / radius;
            const wave = Math.sin(dist * 0.08 - timestamp * 0.004) * t;
            const shift = Math.round(wave * 3);
            charIdx = Math.max(0, Math.min(rampLen - 2, charIdx + shift));
          }

          const char = ASCII_RAMP[charIdx];
          if (char === ' ') continue;

          const gray = isDark ? 180 : 80;
          ctx.fillStyle = `rgba(${gray},${gray},${gray},${a / 255})`;
          ctx.fillText(char, cx, cy);
        }
      }

      rafRef.current = requestAnimationFrame(render);
    }

    rafRef.current = requestAnimationFrame(render);
  }

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
