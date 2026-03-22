'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Plus, Minus, Download, GripVertical } from 'lucide-react';
import { useAccount } from 'wagmi';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { HIDE_TESTNETS } from '@/utils/constants/chains';

const font = { fontFamily: 'var(--font-departure-mono)' };
const CANVAS_W = 1500;
const CANVAS_H = 500;
const PAD = 40;

interface BannerNft {
  tokenId: string;
  name: string;
  svg: string;
  imageUrl: string;
}

// ══════════════════════════════════════════════════════════════
//  CANVAS RENDERER
// ══════════════════════════════════════════════════════════════

function calcLayout(count: number) {
  if (count === 0) return { cols: 0, rows: 0, size: 0 };
  if (count <= 4) {
    const cols = count;
    const size = Math.min(CANVAS_H - PAD * 2, (CANVAS_W - PAD * 2) / cols);
    return { cols, rows: 1, size };
  }
  // Optimize cols for 3:1 ratio canvas
  let bestCols = count;
  let bestSize = 0;
  for (let c = 2; c <= count; c++) {
    const r = Math.ceil(count / c);
    const s = Math.min((CANVAS_W - PAD * 2) / c, (CANVAS_H - PAD * 2) / r);
    if (s > bestSize) { bestSize = s; bestCols = c; }
  }
  return { cols: bestCols, rows: Math.ceil(count / bestCols), size: bestSize };
}

// Rasterize SVG at native 64x64 into an ImageBitmap, then scale with nearest-neighbor
function rasterizeSvg(svg: string): Promise<ImageBitmap> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Render SVG at native pixel size (64x64) to avoid anti-aliasing artifacts
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
      // Draw to a tiny 64x64 canvas to get a clean bitmap
      const tmp = document.createElement('canvas');
      tmp.width = 64;
      tmp.height = 64;
      const ctx = tmp.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, 64, 64);
      createImageBitmap(tmp).then(resolve).catch(reject);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('SVG load failed')); };
    img.src = url;
  });
}

function setupCanvas(canvas: HTMLCanvasElement) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = CANVAS_W * dpr;
  canvas.height = CANVAS_H * dpr;
  canvas.style.width = '100%';
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  return ctx;
}

async function renderBanner(canvas: HTMLCanvasElement, nfts: BannerNft[], bgColor: string) {
  const ctx = setupCanvas(canvas);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  if (nfts.length === 0) {
    ctx.fillStyle = '#888';
    ctx.font = '24px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Add agents to build your banner', CANVAS_W / 2, CANVAS_H / 2);
    return;
  }

  const { cols, size } = calcLayout(nfts.length);
  const rows = Math.ceil(nfts.length / cols);
  const totalW = cols * size;
  const totalH = rows * size;
  const ox = (CANVAS_W - totalW) / 2;
  const oy = (CANVAS_H - totalH) / 2;

  ctx.imageSmoothingEnabled = false;

  // Rasterize each SVG at native 64x64 then scale with nearest-neighbor
  const bitmaps = await Promise.all(
    nfts.map(nft => nft.svg ? rasterizeSvg(nft.svg).catch(() => null) : Promise.resolve(null))
  );

  for (let i = 0; i < nfts.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = ox + col * size;
    const y = oy + row * size;

    if (bitmaps[i]) {
      ctx.drawImage(bitmaps[i]!, x, y, size, size);
    } else {
      ctx.fillStyle = '#333';
      ctx.fillRect(x, y, size, size);
      ctx.fillStyle = '#666';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`#${nfts[i].tokenId}`, x + size / 2, y + size / 2);
    }
  }
}

// Export at 1x resolution (1500x500) regardless of DPR
function exportCanvas(canvas: HTMLCanvasElement, nfts: BannerNft[], bgColor: string): Promise<string> {
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = CANVAS_W;
  exportCanvas.height = CANVAS_H;
  return renderBannerToCtx(exportCanvas, nfts, bgColor, 1).then(() => exportCanvas.toDataURL('image/png'));
}

async function renderBannerToCtx(canvas: HTMLCanvasElement, nfts: BannerNft[], bgColor: string, dpr: number) {
  canvas.width = CANVAS_W * dpr;
  canvas.height = CANVAS_H * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  if (nfts.length === 0) return;

  const { cols, size } = calcLayout(nfts.length);
  const rows = Math.ceil(nfts.length / cols);
  const totalW = cols * size;
  const totalH = rows * size;
  const ox = (CANVAS_W - totalW) / 2;
  const oy = (CANVAS_H - totalH) / 2;
  ctx.imageSmoothingEnabled = false;

  const bitmaps = await Promise.all(
    nfts.map(nft => nft.svg ? rasterizeSvg(nft.svg).catch(() => null) : Promise.resolve(null))
  );

  for (let i = 0; i < nfts.length; i++) {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = ox + col * size;
    const y = oy + row * size;
    if (bitmaps[i]) {
      ctx.drawImage(bitmaps[i]!, x, y, size, size);
    } else {
      ctx.fillStyle = '#333';
      ctx.fillRect(x, y, size, size);
      ctx.fillStyle = '#666';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`#${nfts[i].tokenId}`, x + size / 2, y + size / 2);
    }
  }
}

// ══════════════════════════════════════════════════════════════
//  SORTABLE NFT STRIP
// ══════════════════════════════════════════════════════════════

function SortableStrip({
  nfts,
  onReorder,
  onRemove,
}: {
  nfts: BannerNft[];
  onReorder: (from: number, to: number) => void;
  onRemove: (tokenId: string) => void;
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
            if (dragIdx.current !== null && dragIdx.current !== i) {
              onReorder(dragIdx.current, i);
            }
            dragIdx.current = null;
            setHoverIdx(null);
          }}
          onDragEnd={() => { dragIdx.current = null; setHoverIdx(null); }}
        >
          {nft.svg ? (
            <img
              src={`data:image/svg+xml,${encodeURIComponent(nft.svg)}`}
              alt={nft.name}
              className="w-full h-full"
              style={{ imageRendering: 'pixelated' }}
              draggable={false}
            />
          ) : (
            <div className="w-full h-full bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-[8px] text-muted-foreground" style={font}>
              #{nft.tokenId}
            </div>
          )}
          <div className="absolute top-0 left-0 w-full h-full bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
            <GripVertical className="w-3 h-3 text-white opacity-0 group-hover:opacity-70" />
          </div>
          <button
            onClick={() => onRemove(nft.tokenId)}
            className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-500 text-white text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <Minus className="w-2.5 h-2.5" />
          </button>
          <span className="absolute bottom-0 left-0 right-0 text-center text-[7px] text-white bg-black/50 truncate px-0.5" style={font}>
            #{nft.tokenId}
          </span>
        </div>
      ))}
      {nfts.length === 0 && (
        <p className="text-[10px] text-muted-foreground/50 py-4" style={font}>
          No agents selected. Add from your collection below.
        </p>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  PAGE
// ══════════════════════════════════════════════════════════════

export default function BannerBuilderPage() {
  const { address: connectedAddress } = useAccount();
  const [addressInput, setAddressInput] = useState('');
  const [network, setNetwork] = useState<'mainnet' | 'testnet'>(HIDE_TESTNETS ? 'mainnet' : 'testnet');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ownedNfts, setOwnedNfts] = useState<BannerNft[]>([]);
  const [selectedNfts, setSelectedNfts] = useState<BannerNft[]>([]);
  const [bgMode, setBgMode] = useState<'dark' | 'light'>('dark');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chain = network === 'mainnet' ? 'shape' : 'shape-sepolia';

  // Re-render canvas when selection or bg changes
  useEffect(() => {
    if (!canvasRef.current) return;
    const bg = bgMode === 'dark' ? '#0a0a0a' : '#ffffff';
    renderBanner(canvasRef.current, selectedNfts, bg);
  }, [selectedNfts, bgMode]);

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

  const addNft = (nft: BannerNft) => {
    if (!selectedNfts.find(n => n.tokenId === nft.tokenId)) {
      setSelectedNfts(prev => [...prev, nft]);
    }
  };

  const removeNft = (tokenId: string) => {
    setSelectedNfts(prev => prev.filter(n => n.tokenId !== tokenId));
  };

  const reorderNfts = (from: number, to: number) => {
    setSelectedNfts(prev => {
      const arr = [...prev];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return arr;
    });
  };

  const handleExport = async () => {
    if (selectedNfts.length === 0) return;
    const bg = bgMode === 'dark' ? '#0a0a0a' : '#ffffff';
    const dataUrl = await exportCanvas(
      document.createElement('canvas'),
      selectedNfts,
      bg,
    );
    const link = document.createElement('a');
    link.download = 'booa-banner.png';
    link.href = dataUrl;
    link.click();
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
                  <ArrowLeft className="w-4 h-4" />
                  Back to Studio
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
                            className={`flex-1 py-2 border-2 border-neutral-700 dark:border-neutral-200 text-xs transition-colors ${
                              network === 'mainnet'
                                ? 'bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900'
                                : 'bg-white dark:bg-neutral-900 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                            }`} style={font}>Shape</button>
                          <button type="button" onClick={() => setNetwork('testnet')}
                            className={`flex-1 py-2 border-2 border-l-0 border-neutral-700 dark:border-neutral-200 text-xs transition-colors ${
                              network === 'testnet'
                                ? 'bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900'
                                : 'bg-white dark:bg-neutral-900 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                            }`} style={font}>Shape Sepolia</button>
                        </div>
                      )}
                    </div>

                    {/* Wallet address */}
                    <div>
                      <label className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5 block" style={font}>Wallet Address</label>
                      <input
                        type="text"
                        value={addressInput}
                        onChange={(e) => { setAddressInput(e.target.value); setError(''); }}
                        onKeyDown={(e) => e.key === 'Enter' && fetchNfts(addressInput)}
                        placeholder="0x..."
                        className="w-full p-2.5 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 text-sm outline-none placeholder:text-neutral-500 dark:placeholder:text-neutral-400 font-mono"
                        style={font}
                      />
                    </div>

                    {/* Connected wallet shortcut */}
                    {connectedAddress && (
                      <button
                        onClick={() => { setAddressInput(connectedAddress); fetchNfts(connectedAddress); }}
                        className="w-full h-9 border border-neutral-300 dark:border-neutral-600 text-[10px] text-muted-foreground hover:text-foreground hover:border-neutral-500 transition-colors"
                        style={font}
                      >
                        USE CONNECTED WALLET ({connectedAddress.slice(0, 6)}...{connectedAddress.slice(-4)})
                      </button>
                    )}

                    {error && <p className="text-[10px] text-red-500" style={font}>{error}</p>}

                    <button
                      onClick={() => fetchNfts(addressInput)}
                      disabled={!addressInput || loading}
                      className="w-full h-11 border-2 border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900 text-xs hover:bg-neutral-600 dark:hover:bg-neutral-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      style={font}
                    >
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
                    <canvas
                      ref={canvasRef}
                      className="w-full"
                      style={{ imageRendering: 'pixelated', aspectRatio: '3/1' }}
                    />
                  </div>

                  {/* Controls bar */}
                  <div className="flex items-center gap-3 flex-wrap">
                    {/* BG toggle */}
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] uppercase tracking-wider text-muted-foreground" style={font}>BG</span>
                      <div className="flex">
                        <button onClick={() => setBgMode('dark')}
                          className={`px-3 py-1.5 border-2 border-neutral-700 dark:border-neutral-200 text-[10px] transition-colors ${
                            bgMode === 'dark'
                              ? 'bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900'
                              : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                          }`} style={font}>Dark</button>
                        <button onClick={() => setBgMode('light')}
                          className={`px-3 py-1.5 border-2 border-l-0 border-neutral-700 dark:border-neutral-200 text-[10px] transition-colors ${
                            bgMode === 'light'
                              ? 'bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900'
                              : 'text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800'
                          }`} style={font}>Light</button>
                      </div>
                    </div>

                    <div className="flex-1" />

                    <span className="text-[9px] text-muted-foreground/50" style={font}>
                      {selectedNfts.length} agent{selectedNfts.length !== 1 ? 's' : ''} selected
                    </span>

                    {/* Export */}
                    <button
                      onClick={handleExport}
                      disabled={selectedNfts.length === 0}
                      className="flex items-center gap-2 px-4 py-2 border-2 border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900 text-[10px] transition-colors hover:bg-neutral-600 dark:hover:bg-neutral-300 disabled:opacity-30 disabled:cursor-not-allowed"
                      style={font}
                    >
                      <Download className="w-3 h-3" />
                      EXPORT PNG
                    </button>
                  </div>

                  {/* Selected NFTs — sortable strip */}
                  <div>
                    <label className="text-[9px] uppercase tracking-wider text-muted-foreground mb-2 block" style={font}>
                      Banner Order (drag to reorder)
                    </label>
                    <SortableStrip nfts={selectedNfts} onReorder={reorderNfts} onRemove={removeNft} />
                  </div>

                  {/* Owned NFTs — grid */}
                  <div>
                    <label className="text-[9px] uppercase tracking-wider text-muted-foreground mb-2 block" style={font}>
                      Your Agents ({ownedNfts.length})
                    </label>
                    <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
                      {ownedNfts.map((nft, idx) => {
                        const sel = isSelected(nft.tokenId);
                        return (
                          <button
                            key={`${nft.tokenId}-${idx}`}
                            onClick={() => sel ? removeNft(nft.tokenId) : addNft(nft)}
                            className={`relative aspect-square border-2 transition-all ${
                              sel
                                ? 'border-neutral-400 dark:border-white ring-1 ring-neutral-400/30 dark:ring-white/30'
                                : 'border-neutral-300 dark:border-neutral-600 hover:border-neutral-500 dark:hover:border-neutral-400'
                            }`}
                          >
                            {nft.svg ? (
                              <img
                                src={`data:image/svg+xml,${encodeURIComponent(nft.svg)}`}
                                alt={nft.name}
                                className="w-full h-full"
                                style={{ imageRendering: 'pixelated' }}
                              />
                            ) : nft.imageUrl ? (
                              <img src={nft.imageUrl} alt={nft.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full bg-neutral-200 dark:bg-neutral-800 flex items-center justify-center text-[8px] text-muted-foreground" style={font}>
                                #{nft.tokenId}
                              </div>
                            )}
                            {/* Add/remove overlay */}
                            <div className={`absolute inset-0 flex items-center justify-center transition-colors ${
                              sel ? 'bg-neutral-500/20 dark:bg-white/20' : 'bg-transparent hover:bg-black/20'
                            }`}>
                              {sel ? (
                                <Minus className="w-4 h-4 text-white drop-shadow" />
                              ) : (
                                <Plus className="w-4 h-4 text-white opacity-0 hover:opacity-100 drop-shadow" />
                              )}
                            </div>
                            <span className="absolute bottom-0 left-0 right-0 text-center text-[7px] text-white bg-black/50 truncate px-0.5" style={font}>
                              #{nft.tokenId}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Load different wallet */}
                  <div className="flex items-center gap-3 pt-4 border-t border-neutral-200 dark:border-neutral-800">
                    <input
                      type="text"
                      value={addressInput}
                      onChange={(e) => setAddressInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && fetchNfts(addressInput)}
                      placeholder="Load different wallet..."
                      className="flex-1 p-2 bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-[10px] text-foreground outline-none font-mono"
                      style={font}
                    />
                    <button
                      onClick={() => fetchNfts(addressInput)}
                      disabled={!addressInput || loading}
                      className="px-4 py-2 border border-neutral-300 dark:border-neutral-600 text-[10px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                      style={font}
                    >
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
