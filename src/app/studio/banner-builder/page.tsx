'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Minus, Download, GripVertical } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { HIDE_TESTNETS } from '@/utils/constants/chains';

const font = { fontFamily: 'var(--font-departure-mono)' };
const CANVAS_W = 1500;
const CANVAS_H = 500;
const PAD = 40;

// ══════════════════════════════════════════════════════════════
//  PALETTE EXTRACTION
// ══════════════════════════════════════════════════════════════

function colorDist(c1: string, c2: string): number {
  const r1 = parseInt(c1.slice(1, 3), 16), g1 = parseInt(c1.slice(3, 5), 16), b1 = parseInt(c1.slice(5, 7), 16);
  const r2 = parseInt(c2.slice(1, 3), 16), g2 = parseInt(c2.slice(3, 5), 16), b2 = parseInt(c2.slice(5, 7), 16);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

function toHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => Math.min(255, v).toString(16).padStart(2, '0')).join('');
}

// Extract dominant colors from a set of bitmaps — combined palette, no duplicates
async function extractPalette(bitmaps: (ImageBitmap | null)[]): Promise<string[]> {
  const counts = new Map<string, number>();
  const Q = 24; // quantize bucket size

  for (const bm of bitmaps) {
    if (!bm) continue;
    const tmp = document.createElement('canvas');
    tmp.width = 64; tmp.height = 64;
    const ctx = tmp.getContext('2d')!;
    ctx.drawImage(bm, 0, 0, 64, 64);
    const { data } = ctx.getImageData(0, 0, 64, 64);
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 128) continue; // skip transparent
      const r = Math.round(data[i] / Q) * Q;
      const g = Math.round(data[i + 1] / Q) * Q;
      const b = Math.round(data[i + 2] / Q) * Q;
      const key = `${r},${g},${b}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  // Sort by frequency
  const sorted = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => {
      const [r, g, b] = key.split(',').map(Number);
      return toHex(r, g, b);
    });

  // Deduplicate by perceptual distance
  const unique: string[] = [];
  for (const c of sorted) {
    if (!unique.some(u => colorDist(u, c) < 48)) unique.push(c);
    if (unique.length >= 14) break;
  }

  // Filter out near-black and near-white to keep swatches useful
  return unique.filter(c => {
    const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return lum > 20 && lum < 235;
  });
}

// ══════════════════════════════════════════════════════════════
//  TYPES
// ══════════════════════════════════════════════════════════════

interface BannerNft {
  tokenId: string;
  name: string;
  svg: string;
  imageUrl: string;
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
  shadow: ShadowConfig;
  badge: BadgeConfig;
}




// ══════════════════════════════════════════════════════════════
//  CANVAS RENDERER
// ══════════════════════════════════════════════════════════════

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
  opts: RenderOptions,
  dpr: number
) {
  canvas.width = CANVAS_W * dpr;
  canvas.height = CANVAS_H * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = opts.bgColor;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  if (nfts.length === 0) return;

  // Simple auto-grid layout
  const count = nfts.length;
  const getCols = (n: number) => {
    if (n <= 4) return n;
    let bc = 2, bs = 0;
    for (let c = 2; c <= n; c++) {
      const r = Math.ceil(n / c);
      const s = Math.min((CANVAS_W - PAD * 2) / c, (CANVAS_H - PAD * 2) / r);
      if (s > bs) { bs = s; bc = c; }
    }
    return bc;
  };
  const cols = getCols(count);
  const rows = Math.ceil(count / cols);
  const size = Math.min((CANVAS_W - PAD * 2) / cols, (CANVAS_H - PAD * 2) / rows);
  const totalW = cols * size, totalH = rows * size;
  const ox = PAD + ((CANVAS_W - PAD * 2) - totalW) / 2;
  const oy = PAD + ((CANVAS_H - PAD * 2) - totalH) / 2;
  const positions = Array.from({ length: count }, (_, i) => ({
    x: ox + (i % cols) * size,
    y: oy + Math.floor(i / cols) * size,
  }));
  ctx.imageSmoothingEnabled = false;

  const bitmaps = await Promise.all(
    nfts.map(nft => nft.svg ? rasterizeSvg(nft.svg).catch(() => null) : Promise.resolve(null))
  );

  for (let i = 0; i < nfts.length; i++) {
    const { x, y } = positions[i];
    if (bitmaps[i]) {
      applyShadow(ctx, opts.shadow);
      ctx.drawImage(bitmaps[i]!, x, y, size, size);
    } else {
      clearShadow(ctx);
      ctx.fillStyle = '#333';
      ctx.fillRect(x, y, size, size);
      ctx.fillStyle = '#666';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`#${nfts[i].tokenId}`, x + size / 2, y + size / 2);
    }

    if (opts.badge.enabled && size > 40) {
      clearShadow(ctx);
      const bh = Math.max(14, size * 0.12);
      ctx.fillStyle = hexToRgba(opts.badge.bgColor, 0.78);
      ctx.fillRect(x, y + size - bh, size, bh);
      ctx.fillStyle = opts.badge.textColor;
      ctx.font = `${Math.max(8, bh * 0.68)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`#${nfts[i].tokenId}`, x + size / 2, y + size - bh / 2);
    }
  }
  clearShadow(ctx);
}

async function renderBanner(canvas: HTMLCanvasElement, nfts: BannerNft[], opts: RenderOptions) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = CANVAS_W * dpr;
  canvas.height = CANVAS_H * dpr;
  canvas.style.width = '100%';
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = opts.bgColor;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  if (nfts.length === 0) {
    ctx.fillStyle = '#888';
    ctx.font = '24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Add agents to build your banner', CANVAS_W / 2, CANVAS_H / 2);
    return;
  }
  await renderBannerToCtx(canvas, nfts, opts, dpr);
}

function exportCanvas(canvas: HTMLCanvasElement, nfts: BannerNft[], opts: RenderOptions): Promise<string> {
  const exp = document.createElement('canvas');
  return renderBannerToCtx(exp, nfts, opts, 1).then(() => exp.toDataURL('image/png'));
}


// ══════════════════════════════════════════════════════════════
//  SLIDER ROW
// ══════════════════════════════════════════════════════════════

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

// ══════════════════════════════════════════════════════════════
//  SORTABLE NFT STRIP
// ══════════════════════════════════════════════════════════════

function SortableStrip({ nfts, onReorder, onRemove }: {
  nfts: BannerNft[]; onReorder: (from: number, to: number) => void; onRemove: (tokenId: string) => void;
}) {
  const dragIdx = useRef<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  return (
    <div className="flex flex-wrap gap-2">
      {nfts.map((nft, i) => (
        <div
          key={nft.tokenId}
          className={`relative group w-14 h-14 border-2 cursor-grab active:cursor-grabbing select-none ${
            hoverIdx === i ? 'border-neutral-400 dark:border-white' : 'border-neutral-300 dark:border-neutral-600'
          }`}
          style={{ imageRendering: 'pixelated' }}
          draggable
          onDragStart={() => { dragIdx.current = i; }}
          onDragOver={(e) => { e.preventDefault(); setHoverIdx(i); }}
          onDragLeave={() => setHoverIdx(null)}
          onDrop={() => {
            if (dragIdx.current !== null && dragIdx.current !== i) onReorder(dragIdx.current, i);
            dragIdx.current = null; setHoverIdx(null);
          }}
          onDragEnd={() => { dragIdx.current = null; setHoverIdx(null); }}
        >
          {nft.svg ? (
            <img src={`data:image/svg+xml,${encodeURIComponent(nft.svg)}`} alt={nft.name}
              className="w-full h-full" style={{ imageRendering: 'pixelated' }} draggable={false} />
          ) : (
            <div className="w-full h-full bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-[8px] text-muted-foreground" style={font}>
              #{nft.tokenId}
            </div>
          )}
          <div className="absolute top-0 left-0 w-full h-full bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <GripVertical className="w-3 h-3 text-white opacity-0 group-hover:opacity-70" />
          </div>
          <button onClick={() => onRemove(nft.tokenId)}
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Minus className="w-2.5 h-2.5" />
          </button>
          <span className="absolute bottom-0 left-0 right-0 text-center text-[7px] text-white bg-black/50 truncate px-0.5" style={font}>
            #{nft.tokenId}
          </span>
        </div>
      ))}
      {nfts.length === 0 && (
        <p className="text-[10px] text-muted-foreground/50 py-4" style={font}>No agents selected. Add from your collection below.</p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  PAGE
// ══════════════════════════════════════════════════════════════

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

  const [shadow, setShadow] = useState<ShadowConfig>({ enabled: false, offsetX: 8, offsetY: 8, blur: 12, color: '#000000', opacity: 0.65 });
  const [badge, setBadge] = useState<BadgeConfig>({ enabled: false, bgColor: '#000000', textColor: '#ffffff' });
  const [hiddenNfts, setHiddenNfts] = useState<Set<string>>(new Set());

  const getRenderOpts = useCallback((): RenderOptions => ({
    bgColor: customBgColor ?? (bgMode === 'dark' ? '#0a0a0a' : '#ffffff'),
    shadow, badge,
  }), [bgMode, customBgColor, shadow, badge]);

  const visibleNfts = selectedNfts.filter(n => !hiddenNfts.has(n.tokenId));

  const toggleHide = (tokenId: string) => {
    setHiddenNfts(prev => {
      const next = new Set(prev);
      next.has(tokenId) ? next.delete(tokenId) : next.add(tokenId);
      return next;
    });
  };

  useEffect(() => {
    if (!canvasRef.current) return;
    renderBanner(canvasRef.current, visibleNfts, getRenderOpts());
  }, [visibleNfts, bgMode, customBgColor, shadow, badge, getRenderOpts]);

  // Extract color palette from selected agents' bitmaps
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
  const reorderNfts = (from: number, to: number) => {
    setSelectedNfts(prev => { const arr = [...prev]; const [item] = arr.splice(from, 1); arr.splice(to, 0, item); return arr; });
  };
  const handleExport = async () => {
    if (visibleNfts.length === 0) return;
    const dataUrl = await exportCanvas(document.createElement('canvas'), visibleNfts, getRenderOpts());
    const link = document.createElement('a'); link.download = 'booa-banner.png'; link.href = dataUrl; link.click();
  };

  const isSelected = (tokenId: string) => selectedNfts.some(n => n.tokenId === tokenId);
  const hasLoaded = ownedNfts.length > 0;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="p-4 md:p-8 lg:p-12">
          <div className="w-full lg:grid lg:grid-cols-12">
            <div className="hidden lg:block lg:col-span-1" />
            <div className="lg:col-span-10">

              {/* Back + Title */}
              <div className="max-w-2xl space-y-6">
                <Link href="/studio" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors" style={font}>
                  <ArrowLeft className="w-4 h-4" /> Back to Studio
                </Link>
                <div className="space-y-2">
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest" style={font}>BOOA Studio</p>
                  <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>Banner Builder</h1>
                  <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                    Build a Twitter/X banner from your BOOA agents. Drag to reorder, export as PNG.
                  </p>
                </div>
              </div>

              {/* Idle: Search Card */}
              {!hasLoaded && (
                <div className="mt-8 flex justify-center">
                  <div className="w-full max-w-sm border-2 border-neutral-700 dark:border-neutral-200 p-5 space-y-5">
                    <div>
                      <label className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5 block" style={font}>Network</label>
                      {!HIDE_TESTNETS && (
                        <div className="flex">
                          <button type="button" onClick={() => setNetwork('mainnet')}
                            className={`flex-1 py-2 border-2 border-neutral-700 dark:border-neutral-200 text-xs transition-colors ${network === 'mainnet' ? 'bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900' : 'bg-white dark:bg-neutral-900 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
                            style={font}>Shape</button>
                          <button type="button" onClick={() => setNetwork('testnet')}
                            className={`flex-1 py-2 border-2 border-l-0 border-neutral-700 dark:border-neutral-200 text-xs transition-colors ${network === 'testnet' ? 'bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900' : 'bg-white dark:bg-neutral-900 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
                            style={font}>Shape Sepolia</button>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5 block" style={font}>Wallet Address</label>
                      <input type="text" value={addressInput} onChange={(e) => { setAddressInput(e.target.value); setError(''); }}
                        onKeyDown={(e) => e.key === 'Enter' && fetchNfts(addressInput)} placeholder="0x..."
                        className="w-full p-2.5 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 text-sm outline-none placeholder:text-neutral-500 dark:placeholder:text-neutral-400 font-mono"
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
                      className="w-full h-11 border-2 border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900 text-xs hover:bg-neutral-600 dark:hover:bg-neutral-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      style={font}>
                      {loading ? 'LOADING...' : 'LOAD AGENTS'}
                    </button>
                  </div>
                </div>
              )}

              {/* Builder */}
              {hasLoaded && (
                <div className="mt-8 space-y-6">

                  {/* Canvas Preview */}
                  <div className="border-2 border-neutral-700 dark:border-neutral-200 overflow-hidden">
                    <canvas ref={canvasRef} className="w-full" style={{ imageRendering: 'pixelated', aspectRatio: '3/1' }} />
                  </div>

                  {/* Controls bar */}
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground" style={font}>BG</span>
                      <div className="flex">
                        <button onClick={() => { setBgMode('dark'); setCustomBgColor(null); }}
                          className={`px-3 py-1.5 border-2 border-neutral-700 dark:border-neutral-200 text-[10px] transition-colors ${bgMode === 'dark' && !customBgColor ? 'bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
                          style={font}>Dark</button>
                        <button onClick={() => { setBgMode('light'); setCustomBgColor(null); }}
                          className={`px-3 py-1.5 border-2 border-l-0 border-neutral-700 dark:border-neutral-200 text-[10px] transition-colors ${bgMode === 'light' && !customBgColor ? 'bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900' : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'}`}
                          style={font}>Light</button>
                      </div>
                      {/* Agent color palette swatches — extracted live from selected agents */}
                      {bgPalette.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="text-[8px] uppercase tracking-wider text-muted-foreground/40" style={font}>Agent Colors</span>
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
                    <div className="flex-1" />
                    <span className="text-[9px] text-muted-foreground/50" style={font}>{selectedNfts.length} agent{selectedNfts.length !== 1 ? 's' : ''} selected</span>
                    <button onClick={handleExport} disabled={selectedNfts.length === 0}
                      className="flex items-center gap-2 px-4 py-2 border-2 border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900 text-[10px] transition-colors hover:bg-neutral-600 dark:hover:bg-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed"
                      style={font}>
                      <Download className="w-3 h-3" />
                      EXPORT PNG
                    </button>
                  </div>

                  {/* ── ADVANCED CONTROLS ─────────────────────────────────── */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                    {/* Shadow + Badge */}
                    <div className="space-y-4">

                      {/* Shadow */}
                      <div className="border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[9px] uppercase tracking-widest text-muted-foreground" style={font}>Shadow</p>
                          <button
                            onClick={() => setShadow(s => ({ ...s, enabled: !s.enabled }))}
                            className={`px-2.5 py-1 border text-[9px] transition-colors ${shadow.enabled ? 'border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900' : 'border-neutral-300 dark:border-neutral-600 text-neutral-500 hover:border-neutral-500'}`}
                            style={font}>{shadow.enabled ? 'ON' : 'OFF'}</button>
                        </div>
                        {shadow.enabled && (
                          <div className="space-y-2.5">
                            <SliderRow label="X" value={shadow.offsetX} min={-60} max={60} onChange={v => setShadow(s => ({ ...s, offsetX: v }))} unit="px" />
                            <SliderRow label="Y" value={shadow.offsetY} min={-60} max={60} onChange={v => setShadow(s => ({ ...s, offsetY: v }))} unit="px" />
                            <SliderRow label="Blur" value={shadow.blur} min={0} max={80} onChange={v => setShadow(s => ({ ...s, blur: v }))} unit="px" />
                            <SliderRow label="Opacity" value={Math.round(shadow.opacity * 100)} min={0} max={100} onChange={v => setShadow(s => ({ ...s, opacity: v / 100 }))} unit="%" />
                            <div className="flex items-center gap-3">
                              <span className="w-14 text-[9px] uppercase tracking-wider text-muted-foreground shrink-0" style={font}>Color</span>
                              <input type="color" value={shadow.color} onChange={e => setShadow(s => ({ ...s, color: e.target.value }))}
                                className="h-6 w-10 border border-neutral-300 dark:border-neutral-600 cursor-pointer bg-transparent" />
                              <span className="text-[9px] text-muted-foreground font-mono">{shadow.color}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Badge (BOOA Number) */}
                      <div className="border border-neutral-200 dark:border-neutral-800 p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[9px] uppercase tracking-widest text-muted-foreground" style={font}>Badge</p>
                          <button
                            onClick={() => setBadge(b => ({ ...b, enabled: !b.enabled }))}
                            className={`px-2.5 py-1 border text-[9px] transition-colors ${badge.enabled ? 'border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900' : 'border-neutral-300 dark:border-neutral-600 text-neutral-500 hover:border-neutral-500'}`}
                            style={font}>{badge.enabled ? 'ON' : 'OFF'}</button>
                        </div>
                        {badge.enabled && (
                          <div className="space-y-2.5">
                            <div className="flex items-center gap-3">
                              <span className="w-14 text-[9px] uppercase tracking-wider text-muted-foreground shrink-0" style={font}>BG</span>
                              <input type="color" value={badge.bgColor} onChange={e => setBadge(b => ({ ...b, bgColor: e.target.value }))}
                                className="h-6 w-10 border border-neutral-300 dark:border-neutral-600 cursor-pointer bg-transparent" />
                              <span className="text-[9px] text-muted-foreground font-mono">{badge.bgColor}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="w-14 text-[9px] uppercase tracking-wider text-muted-foreground shrink-0" style={font}>Text</span>
                              <input type="color" value={badge.textColor} onChange={e => setBadge(b => ({ ...b, textColor: e.target.value }))}
                                className="h-6 w-10 border border-neutral-300 dark:border-neutral-600 cursor-pointer bg-transparent" />
                              <span className="text-[9px] text-muted-foreground font-mono">{badge.textColor}</span>
                            </div>
                          </div>
                        )}
                      </div>

                    </div>
                  </div>
                  {/* ─────────────────────────────────────────────────────── */}

                  {/* Selected NFTs — sortable strip */}
                  <div>
                    <label className="text-[9px] uppercase tracking-wider text-muted-foreground mb-2 block" style={font}>
                      Banner Order (drag to reorder)
                    </label>
                    <SortableStrip nfts={selectedNfts} onReorder={reorderNfts} onRemove={removeNft} />
                  </div>

                  {/* Owned NFTs — grid with per-agent toggle */}
                  <div>
                    <label className="text-[9px] uppercase tracking-wider text-muted-foreground mb-2 block" style={font}>
                      Your Agents ({ownedNfts.length})
                    </label>
                    <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
                      {ownedNfts.map((nft, idx) => {
                        const sel = isSelected(nft.tokenId);
                        const hidden = hiddenNfts.has(nft.tokenId);
                        return (
                          <div key={`${nft.tokenId}-${idx}`} className="flex flex-col gap-0.5">
                            {/* Agent thumbnail */}
                            <button
                              onClick={() => sel ? removeNft(nft.tokenId) : addNft(nft)}
                              className={`relative aspect-square border-2 transition-all ${
                                sel
                                  ? 'border-neutral-400 dark:border-white ring-1 ring-neutral-400/30 dark:ring-white/30'
                                  : 'border-neutral-300 dark:border-neutral-600 hover:border-neutral-500 dark:hover:border-neutral-400'
                              } ${hidden ? 'opacity-30' : ''}`}
                            >
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
                            {/* Per-agent ON/OFF toggle — only shown when selected */}
                            {sel && (
                              <button
                                onClick={() => toggleHide(nft.tokenId)}
                                className={`w-full text-[7px] py-0.5 border transition-colors ${
                                  hidden
                                    ? 'border-neutral-600 text-neutral-600 dark:border-neutral-500 dark:text-neutral-500'
                                    : 'border-neutral-400 dark:border-neutral-400 text-neutral-400 dark:text-neutral-400 hover:border-neutral-200 hover:text-neutral-200'
                                }`}
                                style={font}
                              >
                                {hidden ? 'OFF' : 'ON'}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Load different wallet */}
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
