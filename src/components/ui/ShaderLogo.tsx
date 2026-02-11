'use client';

import { useRef, useEffect, useCallback, useState } from 'react';
import { useTheme } from '@/components/providers/theme-provider';

const MOUSE_RADIUS = 120;

export function ShaderLogo() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const mouseRef = useRef({ x: -1, y: -1 });
  const baseImgRef = useRef<HTMLImageElement | null>(null);
  const colorImgRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(0); // counts loaded images
  const { theme } = useTheme();

  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const staticFrameRef = useRef<ImageData | null>(null);
  const needsStaticRedraw = useRef(true);

  useEffect(() => {
    setReady(0);
    needsStaticRedraw.current = true;
    staticFrameRef.current = null;
    let loaded = 0;

    const baseSrc = theme === 'dark' ? '/khoradark.png' : '/khoralogo.png';

    // Base image (grayscale source) — theme dependent
    const baseImg = new Image();
    baseImg.crossOrigin = 'anonymous';
    baseImg.onload = () => {
      baseImgRef.current = baseImg;
      loaded++;
      if (loaded === 2) setReady(2);
    };
    baseImg.src = baseSrc;

    // Color image — always the dark/blue logo for reveal
    const colorImg = new Image();
    colorImg.crossOrigin = 'anonymous';
    colorImg.onload = () => {
      colorImgRef.current = colorImg;
      loaded++;
      if (loaded === 2) setReady(2);
    };
    colorImg.src = '/khoradark.png';
  }, [theme]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || ready < 2 || !baseImgRef.current || !colorImgRef.current) return;

    const offBase = document.createElement('canvas');
    const offColor = document.createElement('canvas');
    let basePixels: Uint8ClampedArray | null = null;
    let colorPixels: Uint8ClampedArray | null = null;
    let imgW = 0, imgH = 0;

    function drawImages(w: number, h: number) {
      if (w < 1 || h < 1) return;
      const base = baseImgRef.current;
      const color = colorImgRef.current;
      if (!base || !color) return;

      // object-contain positioning (same for both since same aspect)
      const imgAspect = base.naturalWidth / base.naturalHeight;
      const canvasAspect = w / h;
      let dx = 0, dy = 0, dw = w, dh = h;
      if (imgAspect > canvasAspect) {
        dw = w;
        dh = Math.floor(w / imgAspect);
        dx = 0;
        dy = Math.floor((h - dh) / 2);
      } else {
        dh = h;
        dw = Math.floor(h * imgAspect);
        dx = Math.floor((w - dw) / 2);
        dy = 0;
      }

      offBase.width = w;
      offBase.height = h;
      const bCtx = offBase.getContext('2d', { willReadFrequently: true });
      if (!bCtx) return;
      bCtx.clearRect(0, 0, w, h);
      bCtx.drawImage(base, dx, dy, dw, dh);
      basePixels = bCtx.getImageData(0, 0, w, h).data;

      offColor.width = w;
      offColor.height = h;
      const cCtx = offColor.getContext('2d', { willReadFrequently: true });
      if (!cCtx) return;
      cCtx.clearRect(0, 0, w, h);
      cCtx.drawImage(color, dx, dy, dw, dh);
      colorPixels = cCtx.getImageData(0, 0, w, h).data;

      imgW = w;
      imgH = h;
      needsStaticRedraw.current = true;
      staticFrameRef.current = null;
    }

    const dpr = devicePixelRatio || 1;

    function render() {
      if (!canvas) return;
      const cw = canvas.clientWidth;
      const ch = canvas.clientHeight;
      const w = Math.floor(cw * dpr);
      const h = Math.floor(ch * dpr);

      if (canvas.width !== w || canvas.height !== h || sizeRef.current.w !== w) {
        canvas.width = w;
        canvas.height = h;
        sizeRef.current = { w, h };
        ctxRef.current = null;
        drawImages(w, h);
      }

      let ctx = ctxRef.current;
      if (!ctx) {
        ctx = canvas.getContext('2d', { alpha: true });
        ctxRef.current = ctx;
      }
      if (!ctx || !basePixels || !colorPixels) {
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      const mouseActive = mouseRef.current.x >= 0;

      if (!mouseActive && staticFrameRef.current && !needsStaticRedraw.current) {
        ctx.putImageData(staticFrameRef.current, 0, 0);
        rafRef.current = requestAnimationFrame(render);
        return;
      }

      const output = ctx.createImageData(imgW, imgH);
      const out = output.data;
      const base = basePixels;
      const color = colorPixels;
      const radius = MOUSE_RADIUS * dpr;
      const radiusSq = radius * radius;
      const mx = mouseActive ? mouseRef.current.x * dpr : -9999;
      const my = mouseActive ? mouseRef.current.y * dpr : -9999;

      for (let i = 0; i < base.length; i += 4) {
        const br = base[i];
        const bg = base[i + 1];
        const bb = base[i + 2];
        const ba = base[i + 3];

        const pixelIdx = i >> 2;
        const px = pixelIdx % imgW;
        const py = (pixelIdx / imgW) | 0;

        const dx = px - mx;
        const dy = py - my;
        const distSq = dx * dx + dy * dy;

        // Grayscale from base image
        const lum = (0.299 * br + 0.587 * bg + 0.114 * bb) | 0;

        if (distSq < radiusSq) {
          const dist = Math.sqrt(distSq);
          const t = 1 - dist / radius;
          const blend = t * t;

          // Color from the blue/dark logo
          const cr = color[i];
          const cg = color[i + 1];
          const cb = color[i + 2];
          const ca = color[i + 3];

          const bloom = 1 + blend * 0.25;
          // Use whichever has more alpha
          const a = Math.max(ba, ca);

          out[i] = Math.min(255, (lum + (cr - lum) * blend) * bloom) | 0;
          out[i + 1] = Math.min(255, (lum + (cg - lum) * blend) * bloom) | 0;
          out[i + 2] = Math.min(255, (lum + (cb - lum) * blend) * bloom) | 0;
          out[i + 3] = a;
        } else {
          out[i] = lum;
          out[i + 1] = lum;
          out[i + 2] = lum;
          out[i + 3] = ba;
        }
      }

      ctx.putImageData(output, 0, 0);

      if (!mouseActive) {
        staticFrameRef.current = output;
        needsStaticRedraw.current = false;
      }

      rafRef.current = requestAnimationFrame(render);
    }

    drawImages(
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
