'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Minus, Download, Layers } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { HIDE_TESTNETS } from '@/utils/constants/chains';

const font = { fontFamily: 'var(--font-departure-mono)' };

const ASPECT_PRESETS = [
  { id: 'square',  label: '1:1 Square',   w: 1500, h: 1500 },
  { id: 'twitter', label: '3:1 Twitter',  w: 1500, h: 500  },
  { id: '16:9',    label: '16:9',         w: 1920, h: 1080 },
  { id: '4:5',     label: '4:5 IG',       w: 1080, h: 1350 },
] as const;
type AspectId = typeof ASPECT_PRESETS[number]['id'];

const DENSITY_STOPS = [4, 6, 8, 10, 12, 16];
const DEFAULT_DENSITY_INDEX = 1;
const DEFAULT_ASPECT: AspectId = 'square';

function colorDist(c1: string, c2: string): number {
  const r1 = parseInt(c1.slice(1, 3), 16), g1 = parseInt(c1.slice(3, 5), 16), b1 = parseInt(c1.slice(5, 7), 16);
  const r2 = parseInt(c2.slice(1, 3), 16), g2 = parseInt(c2.slice(3, 5), 16), b2 = parseInt(c2.slice(5, 7), 16);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.min(255, v).toString(16).padStart(2, '0')).join('');
}

async function extractPalette(bitmaps: (ImageBitmap | null)[]): Promise<string[]> {
  const counts = new Map<string, number>();
  const Q = 24;
  for (const bm of bitmaps) {
    if (!bm) continue;
    const tmp = document.createElement('canvas');
    tmp.width = 64; tmp.height = 64;
    const ctx = tmp.getContext('2d')!;
    ctx.drawImage(bm, 0, 0, 64, 64);
    const { data } = ctx.getImageData(0, 0, 64, 64);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue;
      const r = Math.round(data[i] / Q) * Q;
      const g = Math.round(data[i + 1] / Q) * Q;
      const b = Math.round(data[i + 2] / Q) * Q;
      const key = `${r},${g},${b}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => {
      const [r, g, b] = key.split(',').map(Number);
      return toHex(r, g, b);
    });
  const unique: string[] = [];
  for (const c of sorted) {
    if (!unique.some(u => colorDist(u, c) < 48)) unique.push(c);
    if (unique.length >= 14) break;
  }
  return unique.filter(c => {
    const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return lum > 20 && lum < 235;
  });
}

interface BannerNft {
  tokenId: string;
  name: string;
  svg: string;
  imageUrl: string;
}

type Formation = 'auto' | 'line' | 'diamond' | 'wedge' | 'flanks' | 'v-formation' | 'circle' | 'random' | 'collage';

interface Point { x: number; y: number }
interface Region {
  polygon: Point[];
  bbox: { x: number; y: number; w: number; h: number };
  centroid: Point;
}

function makeSeededRng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507);
    s = Math.imul(s ^ (s >>> 13), 3266489909);
    s = (s ^ (s >>> 16)) >>> 0;
    return s / 4294967296;
  };
}

function polygonArea(poly: Point[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return Math.abs(a) / 2;
}

function polygonCentroid(poly: Point[]): Point {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const cross = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
    a += cross;
  }
  if (a === 0) {
    let sx = 0, sy = 0;
    for (const p of poly) { sx += p.x; sy += p.y; }
    return { x: sx / poly.length, y: sy / poly.length };
  }
  a /= 2;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

function polygonBbox(poly: Point[]) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

function splitPolygonByLine(poly: Point[], origin: Point, normal: Point): [Point[], Point[]] {
  const a: Point[] = [];
  const b: Point[] = [];
  const sideOf = (p: Point) => (p.x - origin.x) * normal.x + (p.y - origin.y) * normal.y;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const dp = sideOf(p);
    const dq = sideOf(q);
    if (dp >= 0) a.push(p); else b.push(p);
    if ((dp >= 0) !== (dq >= 0)) {
      const t = dp / (dp - dq);
      const ix = p.x + t * (q.x - p.x);
      const iy = p.y + t * (q.y - p.y);
      a.push({ x: ix, y: iy });
      b.push({ x: ix, y: iy });
    }
  }
  return [a, b];
}

function generateCollageRegions(count: number, w: number, h: number, seed: number): Region[] {
  if (count <= 0) return [];
  const rng = makeSeededRng(seed);
  const polys: Point[][] = [[
    { x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h },
  ]];
  while (polys.length < count) {
    let bestIdx = 0;
    let bestArea = 0;
    for (let i = 0; i < polys.length; i++) {
      const ar = polygonArea(polys[i]);
      if (ar > bestArea) { bestArea = ar; bestIdx = i; }
    }
    const target = polys[bestIdx];
    const c = polygonCentroid(target);
    const angle = (rng() - 0.5) * Math.PI * 0.85 + (rng() < 0.5 ? 0 : Math.PI / 2);
    const jitter = (rng() - 0.5) * 0.3;
    const bbox = polygonBbox(target);
    const origin = {
      x: c.x + jitter * bbox.w * 0.25,
      y: c.y + jitter * bbox.h * 0.25,
    };
    const normal = { x: Math.cos(angle), y: Math.sin(angle) };
    const [a, b] = splitPolygonByLine(target, origin, normal);
    if (a.length < 3 || b.length < 3) {
      polys.splice(bestIdx, 1, target);
      continue;
    }
    polys.splice(bestIdx, 1, a, b);
  }
  return polys.map(p => ({
    polygon: p,
    bbox: polygonBbox(p),
    centroid: polygonCentroid(p),
  }));
}

interface ShadowConfig {
  enabled: boolean;
  offsetX: number;
  offsetY: number;
  blur: number;
  color: string;
  opacity: number;
}

interface BadgeConfig {
  enabled: boolean;
  bgColor: string;
  textColor: string;
}

interface RenderOptions {
  bgColor: string;
  formation: Formation;
  shadow: ShadowConfig;
  badge: BadgeConfig;
  aspect: AspectId;
  densityIndex: number;
}

interface Cell { x: number; y: number }

function gridDims(aspectId: AspectId, densityIndex: number) {
  const a = ASPECT_PRESETS.find(p => p.id === aspectId)!;
  const cells = DENSITY_STOPS[densityIndex];
  const cellPx = Math.min(a.w, a.h) / cells;
  const cols = Math.round(a.w / cellPx);
  const rows = Math.round(a.h / cellPx);
  return { cols, rows, cellPx, canvasW: a.w, canvasH: a.h };
}

function computeGridCells(count: number, formation: Formation, cols: number, rows: number): Cell[] {
  if (count === 0) return [];
  const capacity = cols * rows;
  const n = Math.min(count, capacity);

  if (formation === 'auto') {
    const fitCols = Math.min(n, cols);
    const fitRows = Math.ceil(n / fitCols);
    const ox = Math.floor((cols - fitCols) / 2);
    const oy = Math.floor((rows - fitRows) / 2);
    return Array.from({ length: n }, (_, i) => ({
      x: ox + (i % fitCols),
      y: oy + Math.floor(i / fitCols),
    }));
  }

  if (formation === 'line') {
    const fit = Math.min(n, cols);
    const ox = Math.floor((cols - fit) / 2);
    const y = Math.floor((rows - 1) / 2);
    return Array.from({ length: fit }, (_, i) => ({ x: ox + i, y }));
  }

  if (formation === 'diamond') {
    const cx = (cols - 1) / 2;
    const cy = (rows - 1) / 2;
    const taken = new Set<string>();
    const out: Cell[] = [];
    const tryAdd = (dx: number, dy: number) => {
      const x = Math.round(cx + dx);
      const y = Math.round(cy + dy);
      if (x < 0 || x >= cols || y < 0 || y >= rows) return;
      const k = `${x},${y}`;
      if (taken.has(k)) return;
      taken.add(k);
      out.push({ x, y });
    };
    tryAdd(0, 0);
    for (let d = 1; out.length < n && d < cols + rows; d++) {
      if (out.length < n) tryAdd(d, 0);
      if (out.length < n) tryAdd(0, d);
      if (out.length < n) tryAdd(-d, 0);
      if (out.length < n) tryAdd(0, -d);
      for (let i = 1; i < d && out.length < n; i++) {
        const j = d - i;
        if (out.length < n) tryAdd(i, j);
        if (out.length < n) tryAdd(-i, j);
        if (out.length < n) tryAdd(i, -j);
        if (out.length < n) tryAdd(-i, -j);
      }
    }
    return out.slice(0, n);
  }

  if (formation === 'wedge') {
    const out: Cell[] = [];
    let row = 0, idx = 0;
    while (idx < n) {
      const w = row + 1;
      const ox = Math.floor((cols - w) / 2);
      const y = Math.min(row, rows - 1);
      for (let i = 0; i < w && idx < n; i++) {
        out.push({ x: ox + i, y });
        idx++;
      }
      row++;
      if (row >= rows) break;
    }
    return out;
  }

  if (formation === 'flanks') {
    const left = Math.ceil(n / 2);
    const right = n - left;
    const halfCols = Math.floor(cols / 2);
    const cellsLeft: Cell[] = [];
    const cellsRight: Cell[] = [];
    const lCols = Math.min(halfCols, Math.ceil(Math.sqrt(left)));
    const lRows = Math.ceil(left / lCols);
    const lOy = Math.floor((rows - lRows) / 2);
    for (let i = 0; i < left; i++) cellsLeft.push({ x: i % lCols, y: lOy + Math.floor(i / lCols) });
    if (right > 0) {
      const rCols = Math.min(halfCols, Math.ceil(Math.sqrt(right)));
      const rRows = Math.ceil(right / rCols);
      const rOx = cols - rCols;
      const rOy = Math.floor((rows - rRows) / 2);
      for (let i = 0; i < right; i++) cellsRight.push({ x: rOx + (i % rCols), y: rOy + Math.floor(i / rCols) });
    }
    return [...cellsLeft, ...cellsRight];
  }

  if (formation === 'v-formation') {
    const cx = Math.floor(cols / 2);
    const cy = Math.floor(rows / 2);
    const out: Cell[] = [{ x: cx, y: cy }];
    let step = 1;
    while (out.length < n) {
      const upY = cy - step;
      const dnY = cy + step;
      const lx = cx - step;
      const rx = cx + step;
      if (lx >= 0 && upY >= 0) out.push({ x: lx, y: upY });
      if (out.length < n && rx < cols && upY >= 0) out.push({ x: rx, y: upY });
      if (out.length < n && lx >= 0 && dnY < rows) out.push({ x: lx, y: dnY });
      if (out.length < n && rx < cols && dnY < rows) out.push({ x: rx, y: dnY });
      step++;
      if (step > Math.max(cols, rows)) break;
    }
    return out.slice(0, n);
  }

  if (formation === 'circle') {
    const cx = (cols - 1) / 2;
    const cy = (rows - 1) / 2;
    const radius = Math.min(cols, rows) * 0.4;
    const taken = new Set<string>();
    const out: Cell[] = [];
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * 2 * Math.PI - Math.PI / 2;
      let bx = Math.round(cx + radius * Math.cos(angle));
      let by = Math.round(cy + radius * Math.sin(angle));
      bx = Math.max(0, Math.min(cols - 1, bx));
      by = Math.max(0, Math.min(rows - 1, by));
      let attempt = 0;
      while (taken.has(`${bx},${by}`) && attempt < 16) {
        const a2 = angle + (attempt + 1) * 0.15;
        bx = Math.max(0, Math.min(cols - 1, Math.round(cx + radius * Math.cos(a2))));
        by = Math.max(0, Math.min(rows - 1, Math.round(cy + radius * Math.sin(a2))));
        attempt++;
      }
      taken.add(`${bx},${by}`);
      out.push({ x: bx, y: by });
    }
    return out;
  }

  if (formation === 'random') {
    const all: Cell[] = [];
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) all.push({ x, y });
    for (let i = all.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [all[i], all[j]] = [all[j], all[i]];
    }
    return all.slice(0, n);
  }

  return computeGridCells(count, 'auto', cols, rows);
}

function hexToRgba(hex: string, opacity: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${opacity})`;
}

function rasterizeSvg(svg: string): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const parser = new DOMParser();
    const doc = parser.parseFromString(svg, 'image/svg+xml');
    const svgEl = doc.documentElement;
    svgEl.setAttribute('width', '64');
    svgEl.setAttribute('height', '64');
    const serialized = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([serialized], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const tmp = document.createElement('canvas');
      tmp.width = 64; tmp.height = 64;
      const ctx = tmp.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, 64, 64);
      createImageBitmap(tmp).then(resolve).catch(reject);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG load failed')); };
    img.src = url;
  });
}

function applyShadow(ctx: CanvasRenderingContext2D, shadow: ShadowConfig) {
  if (shadow.enabled) {
    ctx.shadowOffsetX = shadow.offsetX;
    ctx.shadowOffsetY = shadow.offsetY;
    ctx.shadowBlur = shadow.blur;
    ctx.shadowColor = hexToRgba(shadow.color, shadow.opacity);
  }
}

function clearShadow(ctx: CanvasRenderingContext2D) {
  ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0; ctx.shadowBlur = 0; ctx.shadowColor = 'transparent';
}

async function renderBannerToCtx(
  canvas: HTMLCanvasElement,
  nfts: BannerNft[],
  cells: Cell[],
  cellPx: number,
  canvasW: number,
  canvasH: number,
  opts: RenderOptions,
  dpr: number,
  regions?: Region[],
) {
  canvas.width = canvasW * dpr;
  canvas.height = canvasH * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = opts.bgColor;
  ctx.fillRect(0, 0, canvasW, canvasH);
  if (nfts.length === 0) return;

  ctx.imageSmoothingEnabled = false;
  const bitmaps = await Promise.all(
    nfts.map(nft => nft.svg ? rasterizeSvg(nft.svg).catch(() => null) : Promise.resolve(null))
  );

  if (opts.formation === 'collage' && regions && regions.length) {
    const strokeColor = (() => {
      const r = parseInt(opts.bgColor.slice(1, 3), 16);
      const g = parseInt(opts.bgColor.slice(3, 5), 16);
      const b = parseInt(opts.bgColor.slice(5, 7), 16);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      return lum < 128 ? '#ffffff' : '#0a0a0a';
    })();
    const strokeWidth = Math.max(2, Math.min(canvasW, canvasH) / 240);
    for (let i = 0; i < regions.length && i < nfts.length; i++) {
      const r = regions[i];
      const bm = bitmaps[i];
      ctx.save();
      ctx.beginPath();
      r.polygon.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.clip();
      if (bm) {
        applyShadow(ctx, opts.shadow);
        const target = Math.max(r.bbox.w, r.bbox.h);
        const drawX = r.centroid.x - target / 2;
        const drawY = r.centroid.y - target / 2;
        ctx.drawImage(bm, drawX, drawY, target, target);
      } else {
        clearShadow(ctx);
        ctx.fillStyle = '#333';
        ctx.fillRect(r.bbox.x, r.bbox.y, r.bbox.w, r.bbox.h);
        ctx.fillStyle = '#666';
        ctx.font = `${Math.max(10, Math.min(r.bbox.w, r.bbox.h) * 0.18)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`#${nfts[i].tokenId}`, r.centroid.x, r.centroid.y);
      }
      ctx.restore();

      if (opts.badge.enabled) {
        ctx.save();
        ctx.beginPath();
        r.polygon.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
        ctx.closePath();
        ctx.clip();
        const bh = Math.max(14, Math.min(r.bbox.w, r.bbox.h) * 0.1);
        ctx.fillStyle = hexToRgba(opts.badge.bgColor, 0.78);
        ctx.fillRect(r.bbox.x, r.bbox.y + r.bbox.h - bh, r.bbox.w, bh);
        ctx.fillStyle = opts.badge.textColor;
        ctx.font = `${Math.max(8, bh * 0.68)}px monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`#${nfts[i].tokenId}`, r.centroid.x, r.bbox.y + r.bbox.h - bh / 2);
        ctx.restore();
      }
    }
    clearShadow(ctx);
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = 'miter';
    for (const r of regions) {
      ctx.beginPath();
      r.polygon.forEach((p, idx) => idx === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
      ctx.closePath();
      ctx.stroke();
    }
    return;
  }

  if (cells.length === 0) return;

  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    const x = c.x * cellPx;
    const y = c.y * cellPx;
    if (bitmaps[i]) {
      applyShadow(ctx, opts.shadow);
      ctx.drawImage(bitmaps[i]!, x, y, cellPx, cellPx);
    } else {
      clearShadow(ctx);
      ctx.fillStyle = '#333';
      ctx.fillRect(x, y, cellPx, cellPx);
      ctx.fillStyle = '#666';
      ctx.font = `${Math.max(10, cellPx * 0.18)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`#${nfts[i].tokenId}`, x + cellPx / 2, y + cellPx / 2);
    }

    if (opts.badge.enabled && cellPx > 40) {
      clearShadow(ctx);
      const bh = Math.max(14, cellPx * 0.12);
      ctx.fillStyle = hexToRgba(opts.badge.bgColor, 0.78);
      ctx.fillRect(x, y + cellPx - bh, cellPx, bh);
      ctx.fillStyle = opts.badge.textColor;
      ctx.font = `${Math.max(8, bh * 0.68)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`#${nfts[i].tokenId}`, x + cellPx / 2, y + cellPx - bh / 2);
    }
  }
  clearShadow(ctx);
}

async function renderBanner(
  canvas: HTMLCanvasElement,
  nfts: BannerNft[],
  cells: Cell[],
  cellPx: number,
  canvasW: number,
  canvasH: number,
  opts: RenderOptions,
  regions?: Region[],
) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvasW * dpr;
  canvas.height = canvasH * dpr;
  canvas.style.width = '100%';
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = opts.bgColor;
  ctx.fillRect(0, 0, canvasW, canvasH);
  if (nfts.length === 0) {
    ctx.fillStyle = '#888';
    ctx.font = `${Math.max(16, canvasW / 60)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Add agents to build your banner', canvasW / 2, canvasH / 2);
    return;
  }
  await renderBannerToCtx(canvas, nfts, cells, cellPx, canvasW, canvasH, opts, dpr, regions);
}

function exportCanvas(
  nfts: BannerNft[],
  cells: Cell[],
  cellPx: number,
  canvasW: number,
  canvasH: number,
  opts: RenderOptions,
  regions?: Region[],
): Promise<string> {
  const exp = document.createElement('canvas');
  return renderBannerToCtx(exp, nfts, cells, cellPx, canvasW, canvasH, opts, 1, regions)
    .then(() => exp.toDataURL('image/png'));
}

const FORMATIONS: { label: string; value: Formation }[] = [
  { label: 'Auto',     value: 'auto'        },
  { label: 'Line',     value: 'line'        },
  { label: 'Wedge',    value: 'wedge'       },
  { label: 'Diamond',  value: 'diamond'     },
  { label: 'Flanks',   value: 'flanks'      },
  { label: 'V-Flight', value: 'v-formation' },
  { label: 'Circle',   value: 'circle'      },
  { label: 'Random',   value: 'random'      },
  { label: 'Collage',  value: 'collage'     },
];

function FormationPicker({ value, onChange }: { value: Formation; onChange: (f: Formation) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {FORMATIONS.map(f => (
        <button
          key={f.value}
          onClick={() => onChange(f.value)}
          className={`px-3 py-1.5 border text-[9px] transition-colors ${
            value === f.value
              ? 'border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900'
              : 'border-neutral-300 dark:border-neutral-600 text-neutral-500 hover:border-neutral-500 hover:text-foreground'
          }`}
          style={font}
        >
          {f.label.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function SliderRow({ label, value, min, max, step = 1, onChange, unit = '' }: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void; unit?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-14 text-[9px] uppercase tracking-wider text-muted-foreground shrink-0" style={font}>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        className="flex-1 h-1 accent-neutral-700 dark:accent-neutral-200" />
      <span className="w-10 text-[9px] text-right text-muted-foreground tabular-nums" style={font}>{value}{unit}</span>
    </div>
  );
}

export default function BannerBuilderPage() {
  const { address: connectedAddress } = useAuth();
  const [addressInput, setAddressInput] = useState('');
  const [network, setNetwork] = useState<'mainnet' | 'testnet'>(HIDE_TESTNETS ? 'mainnet' : 'testnet');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ownedNfts, setOwnedNfts] = useState<BannerNft[]>([]);
  const [selectedNfts, setSelectedNfts] = useState<BannerNft[]>([]);
  const [bgMode, setBgMode] = useState<'dark' | 'light'>('dark');
  const [customBgColor, setCustomBgColor] = useState<string | null>(null);
  const [bgPalette, setBgPalette] = useState<string[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chain = network === 'mainnet' ? 'shape' : 'shape-sepolia';

  const [aspect, setAspect] = useState<AspectId>(DEFAULT_ASPECT);
  const [densityIndex, setDensityIndex] = useState(DEFAULT_DENSITY_INDEX);
  const [formation, setFormation] = useState<Formation>('auto');
  const [collageSeed, setCollageSeed] = useState(() => Math.floor(Math.random() * 1e9));
  const [shadow, setShadow] = useState<ShadowConfig>({ enabled: false, offsetX: 8, offsetY: 8, blur: 12, color: '#000000', opacity: 0.65 });
  const [badge, setBadge] = useState<BadgeConfig>({ enabled: false, bgColor: '#000000', textColor: '#ffffff' });

  const dragIdx = useRef<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const grid = useMemo(() => gridDims(aspect, densityIndex), [aspect, densityIndex]);

  const cells = useMemo(
    () => formation === 'collage'
      ? []
      : computeGridCells(selectedNfts.length, formation, grid.cols, grid.rows),
    [selectedNfts.length, formation, grid.cols, grid.rows],
  );

  const regions = useMemo(
    () => formation === 'collage'
      ? generateCollageRegions(selectedNfts.length, grid.canvasW, grid.canvasH, collageSeed)
      : [],
    [formation, selectedNfts.length, grid.canvasW, grid.canvasH, collageSeed],
  );

  const getRenderOpts = useCallback((): RenderOptions => ({
    bgColor: customBgColor ?? (bgMode === 'dark' ? '#0a0a0a' : '#ffffff'),
    formation, shadow, badge, aspect, densityIndex,
  }), [bgMode, customBgColor, formation, shadow, badge, aspect, densityIndex]);

  useEffect(() => {
    if (!canvasRef.current) return;
    renderBanner(canvasRef.current, selectedNfts, cells, grid.cellPx, grid.canvasW, grid.canvasH, getRenderOpts(), regions);
  }, [selectedNfts, cells, regions, grid, getRenderOpts]);

  useEffect(() => {
    if (selectedNfts.length === 0) { setBgPalette([]); return; }
    (async () => {
      const bitmaps = await Promise.all(
        selectedNfts.map(nft => nft.svg ? rasterizeSvg(nft.svg).catch(() => null) : Promise.resolve(null))
      );
      const palette = await extractPalette(bitmaps);
      setBgPalette(palette);
    })();
  }, [selectedNfts]);

  const fetchNfts = useCallback(async (addr: string) => {
    if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) { setError('Invalid address'); return; }
    setError(''); setLoading(true); setOwnedNfts([]); setSelectedNfts([]);
    try {
      const res = await fetch(`/api/banner-nfts?address=${addr}&chain=${chain}`);
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to fetch'); }
      const data = await res.json();
      if (data.nfts.length === 0) throw new Error('No BOOA agents found for this address');
      setOwnedNfts(data.nfts);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed'); } finally { setLoading(false); }
  }, [chain]);

  const addNft = (nft: BannerNft) => { if (!selectedNfts.find(n => n.tokenId === nft.tokenId)) setSelectedNfts(prev => [...prev, nft]); };
  const removeNft = (tokenId: string) => setSelectedNfts(prev => prev.filter(n => n.tokenId !== tokenId));
  const swapAt = (a: number, b: number) => {
    setSelectedNfts(prev => {
      if (a === b || a < 0 || b < 0 || a >= prev.length || b >= prev.length) return prev;
      const next = [...prev];
      [next[a], next[b]] = [next[b], next[a]];
      return next;
    });
  };

  const addAll = () => {
    const remaining = ownedNfts.filter(n => !selectedNfts.some(s => s.tokenId === n.tokenId));
    let next = [...selectedNfts, ...remaining];
    let dIdx = densityIndex;
    while (true) {
      const g = gridDims(aspect, dIdx);
      if (next.length <= g.cols * g.rows) break;
      if (dIdx >= DENSITY_STOPS.length - 1) {
        next = next.slice(0, g.cols * g.rows);
        break;
      }
      dIdx++;
    }
    if (dIdx !== densityIndex) setDensityIndex(dIdx);
    setSelectedNfts(next);
  };

  const handleExport = async () => {
    if (selectedNfts.length === 0) return;
    const dataUrl = await exportCanvas(selectedNfts, cells, grid.cellPx, grid.canvasW, grid.canvasH, getRenderOpts(), regions);
    const link = document.createElement('a'); link.download = 'booa-banner.png'; link.href = dataUrl; link.click();
  };

  const reshuffleCollage = () => setCollageSeed(Math.floor(Math.random() * 1e9));

  const isSelected = (tokenId: string) => selectedNfts.some(n => n.tokenId === tokenId);
  const hasLoaded = ownedNfts.length > 0;

  const aspectStyle = `${grid.canvasW} / ${grid.canvasH}`;
  const cellPercent = useMemo(() => ({
    w: (grid.cellPx / grid.canvasW) * 100,
    h: (grid.cellPx / grid.canvasH) * 100,
  }), [grid]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="p-4 md:p-8 lg:p-12">
          <div className="w-full lg:grid lg:grid-cols-12">
            <div className="hidden lg:block lg:col-span-1" />
            <div className="lg:col-span-10">

              <div className="max-w-2xl space-y-6">
                <Link href="/studio" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors" style={font}>
                  <ArrowLeft className="w-4 h-4" /> Back to Studio
                </Link>
                <div className="space-y-2">
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest" style={font}>BOOA Studio</p>
                  <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>Banner Builder</h1>
                  <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                    Square-grid banner composer for your BOOA agents. Pick an aspect, scale density, drop them on the grid, drag to rearrange.
                  </p>
                </div>
              </div>

              {!hasLoaded && (
                <div className="mt-8 flex justify-center">
                  <div className="w-full max-w-sm rounded-lg border border-neutral-200 dark:border-neutral-800 bg-background shadow-sm p-5 space-y-5">
                    <div>
                      <label className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5 block" style={font}>Network</label>
                      {!HIDE_TESTNETS && (
                        <div className="flex">
                          <button type="button" onClick={() => setNetwork('mainnet')}
                            className={`flex-1 py-2 rounded-l-md border border-neutral-200 dark:border-neutral-800 text-xs transition-colors ${network === 'mainnet' ? 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black' : 'bg-white dark:bg-neutral-900 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
                            style={font}>Shape</button>
                          <button type="button" onClick={() => setNetwork('testnet')}
                            className={`flex-1 py-2 rounded-r-md border border-l-0 border-neutral-200 dark:border-neutral-800 text-xs transition-colors ${network === 'testnet' ? 'bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black' : 'bg-white dark:bg-neutral-900 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
                            style={font}>Shape Sepolia</button>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5 block" style={font}>Wallet Address</label>
                      <input type="text" value={addressInput} onChange={(e) => { setAddressInput(e.target.value); setError(''); }}
                        onKeyDown={(e) => e.key === 'Enter' && fetchNfts(addressInput)} placeholder="0x..."
                        className="w-full p-2.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 text-foreground text-sm outline-none focus:border-neutral-400 dark:focus:border-neutral-600 placeholder:text-neutral-400 dark:placeholder:text-neutral-600 font-mono"
                        style={font} />
                    </div>
                    {connectedAddress && (
                      <button onClick={() => { setAddressInput(connectedAddress); fetchNfts(connectedAddress); }}
                        className="w-full h-9 border border-neutral-300 dark:border-neutral-600 text-[10px] text-muted-foreground hover:text-foreground hover:border-neutral-500 transition-colors"
                        style={font}>
                        USE CONNECTED WALLET ({connectedAddress.slice(0, 6)}...{connectedAddress.slice(-4)})
                      </button>
                    )}
                    {error && <p className="text-[10px] text-red-500" style={font}>{error}</p>}
                    <button onClick={() => fetchNfts(addressInput)} disabled={!addressInput || loading}
                      className="w-full h-11 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black text-xs uppercase tracking-wider hover:opacity-90 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                      style={font}>
                      {loading ? 'LOADING...' : 'LOAD AGENTS'}
                    </button>
                  </div>
                </div>
              )}

              {hasLoaded && (
                <div className="mt-8 space-y-6">

                  <div className="flex flex-col lg:flex-row gap-4">

                    <aside className="lg:w-72 lg:shrink-0 space-y-3 text-xs">

                      <div className="border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
                        <p className="text-[9px] uppercase tracking-widest text-muted-foreground" style={font}>Aspect</p>
                        <div className="grid grid-cols-2 gap-1">
                          {ASPECT_PRESETS.map((p) => {
                            const active = aspect === p.id;
                            return (
                              <button
                                key={p.id}
                                onClick={() => setAspect(p.id)}
                                className={`px-2 py-1.5 border text-[9px] transition-colors ${active ? 'border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900' : 'border-neutral-300 dark:border-neutral-600 text-neutral-500 hover:border-neutral-500 hover:text-foreground'}`}
                                style={font}
                              >
                                {p.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[9px] uppercase tracking-widest text-muted-foreground" style={font}>Density</p>
                          <span className="text-[9px] text-muted-foreground/70 tabular-nums" style={font}>{grid.cols}×{grid.rows}</span>
                        </div>
                        <input
                          type="range"
                          min={0}
                          max={DENSITY_STOPS.length - 1}
                          step={1}
                          value={densityIndex}
                          onChange={(e) => setDensityIndex(Number(e.target.value))}
                          className="w-full h-1 accent-neutral-700 dark:accent-neutral-200"
                        />
                      </div>

                      <div className="border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[9px] uppercase tracking-widest text-muted-foreground" style={font}>Formation</p>
                          {formation === 'collage' && (
                            <button
                              onClick={reshuffleCollage}
                              className="px-2 py-0.5 border border-neutral-300 dark:border-neutral-600 text-[9px] text-neutral-500 hover:text-foreground hover:border-neutral-500 transition-colors"
                              style={font}
                            >
                              RESHUFFLE
                            </button>
                          )}
                        </div>
                        <FormationPicker value={formation} onChange={setFormation} />
                      </div>

                      <div className="border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
                        <p className="text-[9px] uppercase tracking-widest text-muted-foreground" style={font}>Background</p>
                        <div className="flex">
                          <button onClick={() => { setBgMode('dark'); setCustomBgColor(null); }}
                            className={`flex-1 py-1.5 border text-[9px] transition-colors ${bgMode === 'dark' && !customBgColor ? 'border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900' : 'border-neutral-300 dark:border-neutral-600 text-neutral-500 hover:border-neutral-500'}`}
                            style={font}>Dark</button>
                          <button onClick={() => { setBgMode('light'); setCustomBgColor(null); }}
                            className={`flex-1 py-1.5 border border-l-0 text-[9px] transition-colors ${bgMode === 'light' && !customBgColor ? 'border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900' : 'border-neutral-300 dark:border-neutral-600 text-neutral-500 hover:border-neutral-500'}`}
                            style={font}>Light</button>
                        </div>
                        {bgPalette.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1 pt-1">
                            {bgPalette.map(color => (
                              <button
                                key={color}
                                onClick={() => setCustomBgColor(customBgColor === color ? null : color)}
                                title={color}
                                style={{ backgroundColor: color }}
                                className={`w-4 h-4 transition-all ${customBgColor === color ? 'ring-2 ring-white ring-offset-1 ring-offset-black scale-110' : 'opacity-75 hover:opacity-100 hover:scale-110'}`}
                              />
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[9px] uppercase tracking-widest text-muted-foreground" style={font}>Shadow</p>
                          <button
                            onClick={() => setShadow(s => ({ ...s, enabled: !s.enabled }))}
                            className={`px-2 py-0.5 border text-[9px] transition-colors ${shadow.enabled ? 'border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900' : 'border-neutral-300 dark:border-neutral-600 text-neutral-500 hover:border-neutral-500'}`}
                            style={font}>{shadow.enabled ? 'ON' : 'OFF'}</button>
                        </div>
                        {shadow.enabled && (
                          <div className="space-y-2 pt-1">
                            <SliderRow label="X" value={shadow.offsetX} min={-60} max={60} onChange={v => setShadow(s => ({ ...s, offsetX: v }))} unit="px" />
                            <SliderRow label="Y" value={shadow.offsetY} min={-60} max={60} onChange={v => setShadow(s => ({ ...s, offsetY: v }))} unit="px" />
                            <SliderRow label="Blur" value={shadow.blur} min={0} max={80} onChange={v => setShadow(s => ({ ...s, blur: v }))} unit="px" />
                            <SliderRow label="Opacity" value={Math.round(shadow.opacity * 100)} min={0} max={100} onChange={v => setShadow(s => ({ ...s, opacity: v / 100 }))} unit="%" />
                            <div className="flex items-center gap-2">
                              <span className="w-14 text-[9px] uppercase tracking-wider text-muted-foreground shrink-0" style={font}>Color</span>
                              <input type="color" value={shadow.color} onChange={e => setShadow(s => ({ ...s, color: e.target.value }))}
                                className="h-6 w-10 border border-neutral-300 dark:border-neutral-600 cursor-pointer bg-transparent" />
                              <span className="text-[9px] text-muted-foreground font-mono">{shadow.color}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="border border-neutral-200 dark:border-neutral-800 p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[9px] uppercase tracking-widest text-muted-foreground" style={font}>Badge</p>
                          <button
                            onClick={() => setBadge(b => ({ ...b, enabled: !b.enabled }))}
                            className={`px-2 py-0.5 border text-[9px] transition-colors ${badge.enabled ? 'border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900' : 'border-neutral-300 dark:border-neutral-600 text-neutral-500 hover:border-neutral-500'}`}
                            style={font}>{badge.enabled ? 'ON' : 'OFF'}</button>
                        </div>
                        {badge.enabled && (
                          <div className="space-y-2 pt-1">
                            <div className="flex items-center gap-2">
                              <span className="w-14 text-[9px] uppercase tracking-wider text-muted-foreground shrink-0" style={font}>BG</span>
                              <input type="color" value={badge.bgColor} onChange={e => setBadge(b => ({ ...b, bgColor: e.target.value }))}
                                className="h-6 w-10 border border-neutral-300 dark:border-neutral-600 cursor-pointer bg-transparent" />
                              <span className="text-[9px] text-muted-foreground font-mono">{badge.bgColor}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="w-14 text-[9px] uppercase tracking-wider text-muted-foreground shrink-0" style={font}>Text</span>
                              <input type="color" value={badge.textColor} onChange={e => setBadge(b => ({ ...b, textColor: e.target.value }))}
                                className="h-6 w-10 border border-neutral-300 dark:border-neutral-600 cursor-pointer bg-transparent" />
                              <span className="text-[9px] text-muted-foreground font-mono">{badge.textColor}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      <button onClick={handleExport} disabled={selectedNfts.length === 0}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black text-[10px] transition-opacity hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed"
                        style={font}>
                        <Download className="w-3 h-3" />
                        EXPORT PNG
                      </button>

                    </aside>

                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="rounded-md border border-neutral-200 dark:border-neutral-800 overflow-hidden flex items-center justify-center bg-neutral-50 dark:bg-neutral-950 p-2">
                        <div className="relative max-w-full" style={{ aspectRatio: aspectStyle, maxHeight: 'min(70vh, 640px)' }}>
                          <canvas ref={canvasRef} className="w-full h-full block" style={{ imageRendering: 'pixelated' }} />
                          <div className="absolute inset-0">
                            {selectedNfts.map((nft, i) => {
                              let left = 0, top = 0, w = cellPercent.w, h = cellPercent.h;
                              if (formation === 'collage') {
                                const r = regions[i];
                                if (!r) return null;
                                left = (r.bbox.x / grid.canvasW) * 100;
                                top = (r.bbox.y / grid.canvasH) * 100;
                                w = (r.bbox.w / grid.canvasW) * 100;
                                h = (r.bbox.h / grid.canvasH) * 100;
                              } else {
                                const c = cells[i];
                                if (!c) return null;
                                left = (c.x * grid.cellPx / grid.canvasW) * 100;
                                top = (c.y * grid.cellPx / grid.canvasH) * 100;
                              }
                              const isHover = hoverIdx === i;
                              const isDragging = dragIdx.current === i;
                              return (
                                <div
                                  key={nft.tokenId}
                                  draggable
                                  onDragStart={() => { dragIdx.current = i; }}
                                  onDragOver={(e) => { e.preventDefault(); setHoverIdx(i); }}
                                  onDragLeave={() => setHoverIdx(null)}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    if (dragIdx.current !== null && dragIdx.current !== i) swapAt(dragIdx.current, i);
                                    dragIdx.current = null; setHoverIdx(null);
                                  }}
                                  onDragEnd={() => { dragIdx.current = null; setHoverIdx(null); }}
                                  className="absolute cursor-grab active:cursor-grabbing"
                                  style={{
                                    left: `${left}%`,
                                    top: `${top}%`,
                                    width: `${w}%`,
                                    height: `${h}%`,
                                    outline: isHover ? '2px solid rgba(255,255,255,0.85)' : isDragging ? '2px dashed rgba(255,255,255,0.6)' : 'none',
                                    background: isHover ? 'rgba(255,255,255,0.08)' : 'transparent',
                                  }}
                                  title={`#${nft.tokenId}`}
                                />
                              );
                            })}
                          </div>
                        </div>
                      </div>
                      <p className="text-[9px] text-muted-foreground/60 text-right" style={font}>
                        {selectedNfts.length} agent{selectedNfts.length !== 1 ? 's' : ''} · capacity {grid.cols * grid.rows}
                      </p>
                    </div>

                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[9px] uppercase tracking-wider text-muted-foreground" style={font}>
                        Your Agents ({ownedNfts.length})
                      </label>
                      <button
                        onClick={addAll}
                        disabled={selectedNfts.length === ownedNfts.length}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-neutral-300 dark:border-neutral-600 text-[9px] text-neutral-500 hover:text-foreground hover:border-neutral-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        style={font}
                      >
                        <Layers className="w-3 h-3" /> ADD ALL
                      </button>
                    </div>
                    <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
                      {ownedNfts.map((nft, idx) => {
                        const sel = isSelected(nft.tokenId);
                        return (
                          <button key={`${nft.tokenId}-${idx}`} onClick={() => sel ? removeNft(nft.tokenId) : addNft(nft)}
                            className={`relative aspect-square rounded-md overflow-hidden ring-1 transition-all ${sel ? 'ring-2 ring-foreground' : 'ring-neutral-200 dark:ring-neutral-800 hover:ring-neutral-400 dark:hover:ring-neutral-500'}`}>
                            {nft.svg ? (
                              <img src={`data:image/svg+xml,${encodeURIComponent(nft.svg)}`} alt={nft.name} className="w-full h-full" style={{ imageRendering: 'pixelated' }} />
                            ) : nft.imageUrl ? (
                              <img src={nft.imageUrl} alt={nft.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-[8px] text-muted-foreground" style={font}>#{nft.tokenId}</div>
                            )}
                            <div className={`absolute inset-0 flex items-center justify-center transition-colors ${sel ? 'bg-neutral-500/20 dark:bg-white/20' : 'bg-transparent hover:bg-black/20'}`}>
                              {sel ? <Minus className="w-4 h-4 text-white drop-shadow" /> : <Plus className="w-4 h-4 text-white opacity-0 hover:opacity-100 drop-shadow" />}
                            </div>
                            <span className="absolute bottom-0 left-0 right-0 text-center text-[7px] text-white bg-black/50 truncate px-0.5" style={font}>#{nft.tokenId}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                    <input type="text" value={addressInput} onChange={(e) => setAddressInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && fetchNfts(addressInput)} placeholder="Load different wallet..."
                      className="flex-1 p-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-[10px] text-foreground outline-none font-mono"
                      style={font} />
                    <button onClick={() => fetchNfts(addressInput)} disabled={!addressInput || loading}
                      className="px-4 py-2 border border-neutral-300 dark:border-neutral-600 text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                      style={font}>
                      {loading ? 'LOADING...' : 'GO'}
                    </button>
                  </div>

                </div>
              )}

            </div>
            <div className="hidden lg:block lg:col-span-1" />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
