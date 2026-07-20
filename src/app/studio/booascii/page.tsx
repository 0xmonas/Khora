'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Copy, Download, Loader2 } from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { sfx } from '@/lib/sounds';

const BOOA_CONTRACT = '0xbc48fD45aAaf6549293056606397D351a100b222';
const TOTAL_SUPPLY = 3333;

const RAMPS = {
  halftone: ' .:-=+*#%@',
  blocks:   ' .:░▒▓█',
  minimal:  ' .+#',
  dotted:   ' .·•●',
} as const;
type RampKey = keyof typeof RAMPS;

type ColorMode = 'multi' | 'primary' | 'mono';

const SIZE_OPTIONS = [16, 24, 32, 48] as const;
type Size = typeof SIZE_OPTIONS[number];

const PNG_TARGET_PX = 1024;

const SOURCE_SIZE = 64;
const NEUTRAL_THRESHOLD = 28;

const font = { fontFamily: 'var(--font-departure-mono), monospace' };

function isNeutral(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return Math.max(r, g, b) - Math.min(r, g, b) < NEUTRAL_THRESHOLD;
}

function parsePixelGrid(svg: string): (string | null)[][] {
  const grid: (string | null)[][] = Array.from({ length: SOURCE_SIZE }, () =>
    Array<string | null>(SOURCE_SIZE).fill(null),
  );
  const pathRe = /<path[^>]*stroke="(#[0-9a-fA-F]{6})"[^>]*d="([^"]+)"\s*\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = pathRe.exec(svg))) {
    const color = m[1].toLowerCase();
    const d = m[2];
    const cmdRe = /M(-?\d+)\s+(-?\d+)h(\d+)/g;
    let cmd: RegExpExecArray | null;
    while ((cmd = cmdRe.exec(d))) {
      const x = parseInt(cmd[1], 10);
      const y = parseInt(cmd[2], 10);
      const len = parseInt(cmd[3], 10);
      if (y < 0 || y >= SOURCE_SIZE) continue;
      for (let i = 0; i < len; i++) {
        const px = x + i;
        if (px < 0 || px >= SOURCE_SIZE) continue;
        grid[y][px] = color;
      }
    }
  }
  return grid;
}

interface RenderResult {
  rows: { char: string; color: string }[][];
  primary: string;
  width: number;
  height: number;
}

function renderAscii(grid: (string | null)[][], size: Size, ramp: string, invert: boolean): RenderResult {
  const ramps = invert ? Array.from(ramp).reverse().join('') : ramp;
  const rampLen = ramps.length;

  const colorCounts = new Map<string, number>();
  for (const row of grid) for (const c of row) if (c) colorCounts.set(c, (colorCounts.get(c) || 0) + 1);
  const sorted = Array.from(colorCounts.entries()).sort((a, b) => b[1] - a[1]);
  let primary = sorted[0]?.[0] || '#888888';
  for (const [c] of sorted) {
    if (!isNeutral(c)) { primary = c; break; }
  }

  const cells: { char: string; color: string }[][] = [];
  for (let oy = 0; oy < size; oy++) {
    const row: { char: string; color: string }[] = [];
    const sy0 = Math.floor((oy * SOURCE_SIZE) / size);
    const sy1 = Math.floor(((oy + 1) * SOURCE_SIZE) / size);
    for (let ox = 0; ox < size; ox++) {
      const sx0 = Math.floor((ox * SOURCE_SIZE) / size);
      const sx1 = Math.floor(((ox + 1) * SOURCE_SIZE) / size);
      let total = 0;
      let opaque = 0;
      const blockColors = new Map<string, number>();
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          total++;
          const c = grid[sy][sx];
          if (c) {
            opaque++;
            blockColors.set(c, (blockColors.get(c) || 0) + 1);
          }
        }
      }
      const ratio = total > 0 ? opaque / total : 0;
      const idx = Math.min(rampLen - 1, Math.floor(ratio * rampLen));
      const char = ramps[idx];
      let bestColor = primary;
      let bestCount = 0;
      let bestVivid = '';
      let bestVividCount = 0;
      for (const [c, n] of Array.from(blockColors.entries())) {
        if (n > bestCount) { bestCount = n; bestColor = c; }
        if (!isNeutral(c) && n > bestVividCount) { bestVividCount = n; bestVivid = c; }
      }
      const color = bestVivid || bestColor;
      row.push({ char, color });
    }
    cells.push(row);
  }

  let top = 0, bottom = cells.length - 1, left = size - 1, right = 0;
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      if (cells[r][c].char !== ' ' && cells[r][c].char !== ramps[0]) {
        if (r < top || top === 0) top = Math.min(top || r, r);
        if (r > bottom || bottom === cells.length - 1) bottom = Math.max(bottom, r);
        if (c < left) left = c;
        if (c > right) right = c;
      }
    }
  }
  if (right < left) { left = 0; right = size - 1; top = 0; bottom = size - 1; }
  const trimmed = cells.slice(Math.max(0, top - 1), Math.min(cells.length, bottom + 2))
    .map((r) => r.slice(Math.max(0, left - 1), Math.min(r.length, right + 2)));

  return {
    rows: trimmed,
    primary,
    width: trimmed[0]?.length || size,
    height: trimmed.length,
  };
}

function rowsToText(rows: RenderResult['rows']): string {
  return rows.map((row) => row.map((c) => c.char).join('')).join('\n');
}

export default function BooasciiPage() {
  const [tokenInput, setTokenInput] = useState('');
  const [tokenId, setTokenId] = useState<number | null>(null);
  const [agentName, setAgentName] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ramp, setRamp] = useState<RampKey>('halftone');
  const [size, setSize] = useState<Size>(32);
  const [colorMode, setColorMode] = useState<ColorMode>('multi');
  const [invert, setInvert] = useState(false);

  const loadAgent = useCallback(async (id: number) => {
    setLoading(true);
    setError(null);
    setSvg(null);
    setAgentName(null);
    try {
      const [svgRes, metaRes] = await Promise.all([
        fetch(`/api/agent-files/1/${id}/avatar.svg`),
        fetch(`/api/agent-files/1/${id}/agent.json`).catch(() => null),
      ]);
      if (!svgRes.ok) throw new Error(`BOOA #${id} not found`);
      const text = await svgRes.text();
      setSvg(text);
      setTokenId(id);
      if (metaRes && metaRes.ok) {
        const meta = await metaRes.json();
        setAgentName(meta.name ?? null);
      }
      sfx.playSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      sfx.playError();
    } finally {
      setLoading(false);
    }
  }, []);

  function submit() {
    const id = parseInt(tokenInput.trim(), 10);
    if (!Number.isFinite(id) || id < 0 || id >= TOTAL_SUPPLY) {
      setError(`Token id must be 0–${TOTAL_SUPPLY - 1}`);
      sfx.playError();
      return;
    }
    sfx.playClick();
    void loadAgent(id);
  }

  function randomize() {
    const id = Math.floor(Math.random() * TOTAL_SUPPLY);
    setTokenInput(String(id));
    sfx.playClick();
    void loadAgent(id);
  }

  const result = useMemo<RenderResult | null>(() => {
    if (!svg) return null;
    const grid = parsePixelGrid(svg);
    return renderAscii(grid, size, RAMPS[ramp], invert);
  }, [svg, size, ramp, invert]);

  function copyText() {
    if (!result) return;
    const text = rowsToText(result.rows);
    navigator.clipboard?.writeText(text).then(() => sfx.playSuccess(), () => sfx.playError());
  }

  function downloadText() {
    if (!result || tokenId === null) return;
    const text = rowsToText(result.rows);
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `booa-${tokenId}-booascii.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    sfx.playClick();
  }

  async function downloadPng() {
    if (!result || tokenId === null) return;
    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch {}
    }

    let resolvedFamily = 'ui-monospace, monospace';
    try {
      const dom = document.createElement('span');
      dom.style.fontFamily = 'var(--font-departure-mono)';
      dom.style.position = 'fixed';
      dom.style.visibility = 'hidden';
      dom.style.left = '-9999px';
      document.body.appendChild(dom);
      const computed = getComputedStyle(dom).fontFamily;
      document.body.removeChild(dom);
      if (computed && !computed.includes('var(')) {
        resolvedFamily = `${computed}, ui-monospace, monospace`;
      }
    } catch {}

    const longest = Math.max(result.width, result.height);
    const cellSize = Math.max(1, Math.ceil(PNG_TARGET_PX / longest));
    const fontPx = Math.round(cellSize * 1.7);
    const fontStack = `${fontPx}px ${resolvedFamily}`;

    const w = result.width * cellSize;
    const h = result.height * cellSize;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.font = fontStack;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const yOffset = -fontPx * 0.18;
    for (let r = 0; r < result.rows.length; r++) {
      for (let c = 0; c < result.rows[r].length; c++) {
        const cell = result.rows[r][c];
        if (!cell.char || cell.char === ' ') continue;
        let color: string = cell.color;
        if (colorMode === 'primary') color = result.primary;
        else if (colorMode === 'mono') color = '#a59ed8';
        ctx.fillStyle = color;
        ctx.fillText(cell.char, c * cellSize, r * cellSize + yOffset);
      }
    }
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `booa-${tokenId}-booascii.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
    sfx.playClick();
  }

  useEffect(() => {
    if (tokenInput === '' && tokenId === null) {
      void loadAgent(0);
      setTokenInput('0');
    }
  }, [loadAgent, tokenId, tokenInput]);

  const openseaUrl = tokenId !== null
    ? `https://opensea.io/assets/ethereum/${BOOA_CONTRACT}/${tokenId}`
    : null;


  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="p-4 md:p-8 lg:p-12" style={font}>
          <div className="w-full lg:grid lg:grid-cols-12">
            <div className="hidden lg:block lg:col-span-1" />
            <div className="lg:col-span-10">

              <div className="max-w-2xl space-y-6 mb-8">
                <Link href="/studio" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  <ArrowLeft className="w-4 h-4" /> Back to Studio
                </Link>
                <div className="space-y-2">
                  <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">BOOA Studio</p>
                  <h1 className="text-2xl sm:text-3xl text-foreground">BOOASCII</h1>
                  <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
                    Print any BOOA as ASCII. Pick a ramp, scale the resolution, color it like the original or strip it bare. Then ship the text wherever.
                  </p>
                </div>
              </div>

              <div style={{ background: '#7869c4', padding: '28px', ...font }}>
                <div style={{ background: '#40318d', color: '#7869c4', minHeight: 'min(92vh, 1100px)', ...font }} className="p-8 sm:p-14">

                  <div className="text-center mb-10 leading-tight" style={{ color: '#a59ed8' }}>
                    <p className="text-[22px] sm:text-[28px] tracking-widest">**** BOOASCII V1 ****</p>
                    <p className="text-[16px] sm:text-[18px] mt-3">64K RAM SYSTEM &nbsp;&nbsp; {TOTAL_SUPPLY} AGENTS ON-CHAIN</p>
                  </div>

                  <div className="grid gap-10 lg:grid-cols-[300px_minmax(0,1fr)]" style={{ color: '#a59ed8' }}>

                    <aside className="space-y-6 text-[16px]">

                      <div>
                        <p>READY.</p>
                        <div className="flex items-center gap-1">
                          <span>LOAD &quot;BOOA</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            value={tokenInput}
                            onChange={(e) => { setTokenInput(e.target.value); setError(null); }}
                            onKeyDown={(e) => e.key === 'Enter' && submit()}
                            placeholder="####"
                            className="w-16 bg-transparent outline-none placeholder:opacity-30"
                            style={{ color: '#cfc8e9' }}
                          />
                          <span>&quot;</span>
                          <span className="animate-pulse ml-1">█</span>
                        </div>
                        <div className="flex gap-4 pt-2">
                          <button type="button" onClick={submit} disabled={loading} className="hover:underline disabled:opacity-30">
                            {loading ? <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />RUN</span> : 'RUN'}
                          </button>
                          <button type="button" onClick={randomize} disabled={loading} className="hover:underline disabled:opacity-30">
                            RND
                          </button>
                        </div>
                        {error && <p className="pt-1 text-[13px]" style={{ color: '#ff7a90' }}>?{error.toUpperCase()}</p>}
                      </div>

                      <div className="pt-3">
                        <p className="opacity-60 text-[13px] tracking-widest">RAMP</p>
                        <div className="flex flex-wrap gap-x-4 gap-y-1">
                          {(Object.keys(RAMPS) as RampKey[]).map((k) => (
                            <button
                              key={k}
                              type="button"
                              onClick={() => { sfx.playSelect(); setRamp(k); }}
                              className={`hover:underline ${ramp === k ? '' : 'opacity-50'}`}
                            >
                              {ramp === k ? '▸' : ' '}{k.toUpperCase()}
                            </button>
                          ))}
                        </div>
                        <p className="mt-1 ml-3 text-[13px] opacity-50">{RAMPS[ramp]}</p>
                      </div>

                      <div>
                        <p className="opacity-60 text-[13px] tracking-widest">SIZE</p>
                        <div className="flex flex-wrap gap-x-4">
                          {SIZE_OPTIONS.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => { sfx.playSelect(); setSize(s); }}
                              className={`hover:underline ${size === s ? '' : 'opacity-50'}`}
                            >
                              {size === s ? '▸' : ' '}{s}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="opacity-60 text-[13px] tracking-widest">COLOR</p>
                        <div className="flex flex-wrap gap-x-4">
                          {(['multi', 'primary', 'mono'] as ColorMode[]).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => { sfx.playSelect(); setColorMode(m); }}
                              className={`hover:underline ${colorMode === m ? '' : 'opacity-50'}`}
                            >
                              {colorMode === m ? '▸' : ' '}{m.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <p className="opacity-60 text-[13px] tracking-widest">INVERT</p>
                        <button
                          type="button"
                          onClick={() => { sfx.playToggle(!invert); setInvert((v) => !v); }}
                          className="hover:underline"
                        >
                          ▸{invert ? 'ON' : 'OFF'}
                        </button>
                      </div>

                      <div className="pt-4 space-y-1" style={{ borderTop: '1px solid rgba(165,158,216,0.25)' }}>
                        <button type="button" onClick={copyText} disabled={!result} className="flex items-center gap-2 hover:underline disabled:opacity-30 pt-3">
                          <Copy className="h-3 w-3" /> COPY TEXT
                        </button>
                        <button type="button" onClick={downloadText} disabled={!result} className="flex items-center gap-2 hover:underline disabled:opacity-30">
                          <Download className="h-3 w-3" /> SAVE .TXT
                        </button>
                        <button type="button" onClick={downloadPng} disabled={!result} className="flex items-center gap-2 hover:underline disabled:opacity-30">
                          <Download className="h-3 w-3" /> SAVE .PNG
                        </button>
                        {openseaUrl && (
                          <a href={openseaUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:underline">
                            <ExternalLink className="h-3 w-3" /> OPENSEA
                          </a>
                        )}
                      </div>

                    </aside>

                    <section className="flex items-center justify-center min-h-[640px] overflow-auto lg:pr-[340px]">
                      {loading && !result && (
                        <div className="text-[18px] flex items-center gap-2">
                          <Loader2 className="h-5 w-5 animate-spin" /> SEARCHING FOR BOOA…
                        </div>
                      )}
                      {!loading && !result && !error && (
                        <p className="text-[18px]">PRESS RUN TO LOAD</p>
                      )}
                      {result && (
                        <div className="space-y-5 max-w-full">
                          <pre
                            className="whitespace-pre"
                            style={{
                              fontSize: size <= 16 ? '36px' : size <= 24 ? '28px' : size <= 32 ? '22px' : '16px',
                              lineHeight: '1ch',
                              ...font,
                            }}
                          >
                            {result.rows.map((row, r) => (
                              <div key={r}>
                                {row.map((cell, c) => {
                                  let color: string | undefined = cell.color;
                                  if (colorMode === 'primary') color = result.primary;
                                  else if (colorMode === 'mono') color = undefined;
                                  return (
                                    <span key={c} style={color ? { color } : undefined}>{cell.char}</span>
                                  );
                                })}
                              </div>
                            ))}
                          </pre>
                          <p className="text-[14px] text-center tracking-widest">
                            {tokenId !== null && <>BOOA #{tokenId}{agentName ? ` · ${agentName.toUpperCase()}` : ''} · {result.width}×{result.height}</>}
                          </p>
                        </div>
                      )}
                    </section>
                  </div>
                </div>
              </div>

            </div>
            <div className="hidden lg:block lg:col-span-1" />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
