'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeft, Play, Pause, Volume2, SkipBack, SkipForward } from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';

const font = { fontFamily: 'var(--font-departure-mono)' };
const PINK = '#c27a90';

// ══════════════════════════════════════════════════════════════
//  C64 PALETTE → MUSICAL MAPPING
// ══════════════════════════════════════════════════════════════

const C64_HEX = [
  '000000', '626262', '898989', 'ADADAD', 'FFFFFF',
  '9F4E44', 'CB7E75', '6D5412', 'A1683C', 'C9D487',
  '9AE29B', '5CAB5E', '6ABFC6', '887ECB', '50459B',
  'A057A3',
];

const COLOR_NOTES: number[] = [
  0, 65.41, 82.41, 110.00, 146.83, 174.61, 220.00, 130.81,
  164.81, 329.63, 392.00, 261.63, 349.23, 440.00, 293.66, 523.25,
];

const COLOR_BRIGHTNESS: number[] = C64_HEX.map(hex => {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) / 255;
});

const COLOR_WAVE: OscillatorType[] = [
  'sine', 'triangle', 'triangle', 'triangle', 'sine',
  'sawtooth', 'sawtooth', 'square', 'square', 'sine',
  'sine', 'triangle', 'sine', 'sawtooth', 'square', 'sawtooth',
];

// ══════════════════════════════════════════════════════════════
//  SYNTH PARAMS & ENGINE
// ══════════════════════════════════════════════════════════════

interface SynthParams {
  attack: number;
  decay: number;
  delay: number;
  reverb: number;
  volume: number;
}

const DEFAULT_PARAMS: SynthParams = { attack: 0.15, decay: 0.4, delay: 0.2, reverb: 0.15, volume: 0.6 };

function svgToPixelGrid(svgString: string): number[][] {
  const grid: number[][] = Array.from({ length: 64 }, () => new Array(64).fill(0));
  const bgMatch = svgString.match(/<rect fill="#([0-9A-Fa-f]{6})"/);
  if (bgMatch) {
    const bgIndex = C64_HEX.indexOf(bgMatch[1].toUpperCase());
    if (bgIndex >= 0) for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) grid[y][x] = bgIndex;
  }
  const pathRegex = /<path stroke="#([0-9A-Fa-f]{6})" d="([^"]+)"/g;
  let match;
  while ((match = pathRegex.exec(svgString)) !== null) {
    const ci = C64_HEX.indexOf(match[1].toUpperCase());
    if (ci < 0) continue;
    const cmdRegex = /M(\d+)\s+(\d+)h(\d+)/g;
    let cmd;
    while ((cmd = cmdRegex.exec(match[2])) !== null) {
      const x = parseInt(cmd[1], 10), y = parseInt(cmd[2], 10), len = parseInt(cmd[3], 10);
      for (let i = 0; i < len && x + i < 64; i++) if (y < 64) grid[y][x + i] = ci;
    }
  }
  return grid;
}

interface SynthState {
  ctx: AudioContext;
  masterGain: GainNode;
  delayNode: DelayNode;
  delayFeedback: GainNode;
  delayWet: GainNode;
  reverbWet: GainNode;
  reverbDry: GainNode;
  analyser: AnalyserNode;
  stopFlag: { stopped: boolean };
}

function createImpulseResponse(ctx: AudioContext, duration: number, decay: number): AudioBuffer {
  const length = ctx.sampleRate * duration;
  const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
  }
  return impulse;
}

function createSynth(params: SynthParams): SynthState {
  const ctx = new AudioContext();
  const masterGain = ctx.createGain();
  masterGain.gain.value = params.volume * 0.5;
  const delayNode = ctx.createDelay(1.0);
  delayNode.delayTime.value = params.delay * 0.6;
  const delayFeedback = ctx.createGain();
  delayFeedback.gain.value = params.delay * 0.4;
  const delayWet = ctx.createGain();
  delayWet.gain.value = params.delay * 0.5;
  delayNode.connect(delayFeedback);
  delayFeedback.connect(delayNode);
  delayNode.connect(delayWet);
  const convolver = ctx.createConvolver();
  convolver.buffer = createImpulseResponse(ctx, 2.0, 2.5);
  const reverbWet = ctx.createGain();
  reverbWet.gain.value = params.reverb * 0.6;
  const reverbDry = ctx.createGain();
  reverbDry.gain.value = 1 - params.reverb * 0.3;
  convolver.connect(reverbWet);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  masterGain.connect(reverbDry);
  masterGain.connect(delayNode);
  masterGain.connect(convolver);
  reverbDry.connect(analyser);
  delayWet.connect(analyser);
  reverbWet.connect(analyser);
  analyser.connect(ctx.destination);
  return { ctx, masterGain, delayNode, delayFeedback, delayWet, reverbWet, reverbDry, analyser, stopFlag: { stopped: false } };
}

async function playGrid(grid: number[][], synth: SynthState, bpm: number, params: SynthParams, onRow: (row: number) => void) {
  const { ctx, masterGain, stopFlag } = synth;
  const beatDuration = 60 / bpm;
  const attackTime = 0.005 + params.attack * 0.495;
  const decayTime = 0.05 + params.decay * 0.95;
  const noteDuration = attackTime + decayTime;

  for (let row = 0; row < 64; row++) {
    if (stopFlag.stopped) break;
    onRow(row);
    const colorCounts = new Map<number, number>();
    for (let x = 0; x < 64; x++) { const c = grid[row][x]; if (c !== 0) colorCounts.set(c, (colorCounts.get(c) || 0) + 1); }
    const sorted = Array.from(colorCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);

    for (const [colorIdx, count] of sorted) {
      const freq = COLOR_NOTES[colorIdx];
      if (freq === 0) continue;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = COLOR_WAVE[colorIdx];
      osc.frequency.value = freq;
      const vol = Math.min((count / 64) * COLOR_BRIGHTNESS[colorIdx] * 1.5, 0.4);
      const now = ctx.currentTime;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(vol, now + attackTime);
      gain.gain.setValueAtTime(vol, now + attackTime);
      gain.gain.exponentialRampToValueAtTime(0.001, now + noteDuration);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(now);
      osc.stop(now + noteDuration + 0.01);
    }
    if (colorCounts.size >= 6) {
      const bufferSize = ctx.sampleRate * 0.05;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const ng = ctx.createGain();
      ng.gain.setValueAtTime(0.06, ctx.currentTime);
      ng.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.05);
      noise.connect(ng);
      ng.connect(masterGain);
      noise.start(ctx.currentTime);
    }
    await new Promise(resolve => setTimeout(resolve, beatDuration * 1000));
  }
}

// ══════════════════════════════════════════════════════════════
//  KNOB
// ══════════════════════════════════════════════════════════════

function Knob({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const knobRef = useRef<SVGSVGElement>(null);
  const dragging = useRef(false);
  const startY = useRef(0);
  const startVal = useRef(0);
  const angle = -135 + value * 270;
  const rad = (angle * Math.PI) / 180;
  // Indicator line: from center outward
  const cx = 20, cy = 20, r1 = 6, r2 = 15;
  const ix1 = cx + r1 * Math.sin(rad), iy1 = cy - r1 * Math.cos(rad);
  const ix2 = cx + r2 * Math.sin(rad), iy2 = cy - r2 * Math.cos(rad);
  // Arc ticks (small dots around the rim at -135° to +135°, every 30°)
  const ticks: { x: number; y: number }[] = [];
  for (let a = -135; a <= 135; a += 30) {
    const tr = (a * Math.PI) / 180;
    ticks.push({ x: cx + 18 * Math.sin(tr), y: cy - 18 * Math.cos(tr) });
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-[7px] uppercase tracking-wider text-muted-foreground/60" style={font}>{label}</span>
      <svg
        ref={knobRef}
        width={40} height={40} viewBox="0 0 40 40"
        className={`select-none ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-ns-resize'}`}
        style={{ touchAction: 'none' }}
        onPointerDown={(e) => {
          if (disabled) return;
          dragging.current = true; startY.current = e.clientY; startVal.current = value;
          (e.target as SVGElement).setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => { if (!dragging.current) return; onChange(Math.max(0, Math.min(1, startVal.current + (startY.current - e.clientY) / 100))); }}
        onPointerUp={() => { dragging.current = false; }}
      >
        {/* Tick marks */}
        {ticks.map((t, i) => (
          <circle key={i} cx={t.x} cy={t.y} r={0.8} className="fill-neutral-300 dark:fill-neutral-600" />
        ))}
        {/* Outer ring */}
        <circle cx={cx} cy={cy} r={15} fill="none" strokeWidth={2} className="stroke-neutral-300 dark:stroke-neutral-600" />
        {/* Inner fill */}
        <circle cx={cx} cy={cy} r={14} className="fill-neutral-100 dark:fill-neutral-800" />
        {/* Center dot */}
        <circle cx={cx} cy={cy} r={2.5} fill={PINK} />
        {/* Indicator line */}
        <line x1={ix1} y1={iy1} x2={ix2} y2={iy2} stroke={PINK} strokeWidth={2} strokeLinecap="round" />
      </svg>
      <span className="text-[8px] tabular-nums" style={{ ...font, color: PINK }}>{Math.round(value * 100)}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  WAVEFORM
// ══════════════════════════════════════════════════════════════

function WaveformCanvas({ analyser, isPlaying }: { analyser: AnalyserNode | null; isPlaying: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const getBg = () => typeof window !== 'undefined' && document.documentElement.classList.contains('dark') ? '#171717' : '#ffffff';

  useEffect(() => {
    if (!analyser || !isPlaying || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const buf = analyser.frequencyBinCount;
    const arr = new Uint8Array(buf);
    const draw = () => {
      animRef.current = requestAnimationFrame(draw);
      analyser.getByteTimeDomainData(arr);
      ctx.fillStyle = getBg(); ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 1.5; ctx.strokeStyle = PINK; ctx.beginPath();
      const sw = canvas.width / buf; let x = 0;
      for (let i = 0; i < buf; i++) { const y = (arr[i] / 128.0) * canvas.height / 2; if (i === 0) { ctx.moveTo(x, y); } else { ctx.lineTo(x, y); } x += sw; }
      ctx.lineTo(canvas.width, canvas.height / 2); ctx.stroke();
      analyser.getByteFrequencyData(arr);
      const bw = canvas.width / buf * 2;
      for (let i = 0; i < buf / 2; i++) { const bh = (arr[i] / 255) * canvas.height * 0.3; ctx.fillStyle = `rgba(194,122,144,${arr[i] / 255 * 0.2})`; ctx.fillRect(i * bw, canvas.height - bh, bw - 1, bh); }
    };
    draw();
    return () => cancelAnimationFrame(animRef.current);
  }, [analyser, isPlaying]);

  useEffect(() => {
    if (isPlaying || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = getBg(); ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = `${PINK}33`; ctx.lineWidth = 1; ctx.beginPath();
    ctx.moveTo(0, canvas.height / 2); ctx.lineTo(canvas.width, canvas.height / 2); ctx.stroke();
  }, [isPlaying]);

  return <canvas ref={canvasRef} width={400} height={64} className="w-full rounded-sm" style={{ imageRendering: 'auto' }} />;
}

// ══════════════════════════════════════════════════════════════
//  PIXEL GRID
// ══════════════════════════════════════════════════════════════

function PixelGridCanvas({ grid, currentRow }: { grid: number[][] | null; currentRow: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!grid || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d')!;
    const s = canvas.width / 64;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
      ctx.fillStyle = `#${C64_HEX[grid[y][x]]}`;
      // Played rows → full opacity (revealed), current row → full, unplayed → dimmed
      ctx.globalAlpha = currentRow >= 0 ? (y <= currentRow ? 1 : 0.15) : 1;
      ctx.fillRect(x * s, y * s, s, s);
    }
    if (currentRow >= 0 && currentRow < 64) {
      ctx.globalAlpha = 0.35; ctx.fillStyle = PINK;
      ctx.fillRect(0, currentRow * s, canvas.width, s); ctx.globalAlpha = 1;
    }
  }, [grid, currentRow]);
  return <canvas ref={canvasRef} width={320} height={320} className="w-full rounded-sm" style={{ imageRendering: 'pixelated' }} />;
}

// ══════════════════════════════════════════════════════════════
//  PAGE
// ══════════════════════════════════════════════════════════════

export default function AgentSoundPage() {
  const [tokenId, setTokenId] = useState('');
  const [network, setNetwork] = useState<'mainnet' | 'testnet'>('testnet');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [grid, setGrid] = useState<number[][] | null>(null);
  const [agentName, setAgentName] = useState('');
  const [agentImage, setAgentImage] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentRow, setCurrentRow] = useState(-1);
  const [bpm, setBpm] = useState(140);
  const [params, setParams] = useState<SynthParams>(DEFAULT_PARAMS);
  const synthRef = useRef<SynthState | null>(null);

  const updateParam = (key: keyof SynthParams, value: number) => {
    setParams(prev => ({ ...prev, [key]: value }));
    if (synthRef.current) {
      const s = synthRef.current;
      if (key === 'volume') s.masterGain.gain.value = value * 0.5;
      if (key === 'delay') { s.delayNode.delayTime.value = value * 0.6; s.delayFeedback.gain.value = value * 0.4; s.delayWet.gain.value = value * 0.5; }
      if (key === 'reverb') { s.reverbWet.gain.value = value * 0.6; s.reverbDry.gain.value = 1 - value * 0.3; }
    }
  };

  const fetchAgent = useCallback(async (id?: number) => {
    const targetId = id ?? Number(tokenId);
    if (!Number.isInteger(targetId) || targetId < 0) { setError('Enter a valid Token ID'); return; }
    setError(''); setLoading(true); setGrid(null); setAgentName(''); setAgentImage(''); setCurrentRow(-1);
    if (synthRef.current) { synthRef.current.stopFlag.stopped = true; synthRef.current.ctx.close(); synthRef.current = null; setIsPlaying(false); }
    try {
      const res = await fetch(`/api/booa-token?network=${network}&tokenId=${targetId}`);
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Token not found in BOOA collection'); }
      const data = await res.json();
      const imageUri: string = data.image || '';
      setTokenId(String(targetId)); setAgentName(data.name || `BOOA #${targetId}`); setAgentImage(imageUri);
      let svg = '';
      if (imageUri.startsWith('data:image/svg+xml;base64,')) svg = atob(imageUri.split(',')[1]);
      else if (imageUri.startsWith('data:image/svg+xml,')) svg = decodeURIComponent(imageUri.split(',')[1]);
      if (!svg) throw new Error('No SVG data found — this token may not have pixel art');
      setGrid(svgToPixelGrid(svg));
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load token'); } finally { setLoading(false); }
  }, [tokenId, network]);

  const handlePrev = () => { const id = Number(tokenId); if (id > 0) fetchAgent(id - 1); };
  const handleNext = () => fetchAgent(Number(tokenId) + 1);

  const handlePlay = useCallback(async () => {
    if (!grid) return;
    if (isPlaying && synthRef.current) { synthRef.current.stopFlag.stopped = true; synthRef.current.ctx.close(); synthRef.current = null; setIsPlaying(false); setCurrentRow(-1); return; }
    const synth = createSynth(params); synthRef.current = synth; setIsPlaying(true);
    await playGrid(grid, synth, bpm, params, setCurrentRow);
    if (!synth.stopFlag.stopped) { synth.ctx.close(); synthRef.current = null; setIsPlaying(false); setCurrentRow(-1); }
  }, [grid, isPlaying, bpm, params]);

  useEffect(() => { return () => { if (synthRef.current) { synthRef.current.stopFlag.stopped = true; synthRef.current.ctx.close(); } }; }, []);

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
                  <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>Agent Sound</h1>
                  <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                    Each pixel becomes a note. 64 rows, 16 tones, one agent — hear your identity.
                  </p>
                </div>
              </div>

              {/* Idle: Search Card — centered */}
              {!grid && (
                <div className="mt-8 flex justify-center">
                  <div className="w-full max-w-sm border-2 border-neutral-700 dark:border-neutral-200 p-5 space-y-5">
                    <div>
                      <label className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5 block" style={font}>Network</label>
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
                    </div>
                    <div>
                      <label className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1.5 block" style={font}>Token ID</label>
                      <input type="number" min="0" value={tokenId}
                        onChange={(e) => { setTokenId(e.target.value); setError(''); }}
                        onKeyDown={(e) => e.key === 'Enter' && fetchAgent()}
                        placeholder="0"
                        className="w-full p-2.5 bg-neutral-700 text-white dark:bg-neutral-200 dark:text-neutral-900 text-sm outline-none placeholder:text-neutral-500 dark:placeholder:text-neutral-400"
                        style={font} />
                    </div>
                    {error && <p className="text-[10px] text-red-500" style={font}>{error}</p>}
                    <button onClick={() => fetchAgent()} disabled={!tokenId || loading}
                      className="w-full h-11 border-2 border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900 text-xs hover:bg-neutral-600 dark:hover:bg-neutral-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      style={font}>
                      {loading ? 'LOADING...' : 'LOAD AGENT'}
                    </button>
                  </div>
                </div>
              )}

              {/* Device (only visible after agent loaded) */}
              {grid && (
                <div className="mt-8 flex justify-center">
                  <div className="w-full max-w-lg">
                    <div className="border-2 border-neutral-700 dark:border-neutral-200 bg-neutral-50 dark:bg-neutral-900 rounded-sm overflow-hidden">
                      {/* Status */}
                      <div className="px-4 py-2.5 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: isPlaying ? '#5CAB5E' : PINK }} />
                          <span className="text-[9px] uppercase tracking-wider text-muted-foreground" style={font}>
                            {isPlaying ? 'PLAYING' : 'READY'}
                          </span>
                        </div>
                        <span className="text-[9px] text-muted-foreground/50" style={font}>
                          ROW {currentRow >= 0 ? currentRow + 1 : '--'}/64
                        </span>
                      </div>
                      {/* Screen */}
                      <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2.5">
                            {agentImage && (
                              <img src={agentImage} alt={agentName} className="w-8 h-8 rounded-sm border border-neutral-200 dark:border-neutral-700" style={{ imageRendering: 'pixelated' }} />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] text-foreground truncate" style={font}>{agentName}</p>
                              <p className="text-[9px] text-muted-foreground/60" style={font}>BOOA #{tokenId}</p>
                            </div>
                            <span className="text-[10px] tabular-nums" style={{ ...font, color: PINK }}>{bpm} BPM</span>
                          </div>
                          <WaveformCanvas analyser={synthRef.current?.analyser ?? null} isPlaying={isPlaying} />
                        </div>
                      </div>
                      {/* Pixel Grid */}
                      <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
                        <PixelGridCanvas grid={grid} currentRow={currentRow} />
                      </div>
                      {/* Transport */}
                      <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-2">
                        <button onClick={handlePrev} disabled={Number(tokenId) <= 0 || loading}
                          className="w-9 h-9 flex items-center justify-center rounded-sm border border-neutral-300 dark:border-neutral-600 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30">
                          <SkipBack className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={handlePlay}
                          className="flex-1 h-9 flex items-center justify-center gap-2 rounded-sm text-[10px] transition-all"
                          style={{ ...font, border: `2px solid ${PINK}`, color: isPlaying ? '#fff' : PINK, backgroundColor: isPlaying ? PINK : 'transparent' }}>
                          {isPlaying ? <><Pause className="w-3 h-3" /> STOP</> : <><Play className="w-3 h-3" /> PLAY</>}
                        </button>
                        <button onClick={handleNext} disabled={loading}
                          className="w-9 h-9 flex items-center justify-center rounded-sm border border-neutral-300 dark:border-neutral-600 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30">
                          <SkipForward className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {/* Knobs */}
                      <div className="px-4 py-3 border-b border-neutral-200 dark:border-neutral-800">
                        <div className="flex items-start justify-between">
                          <Knob label="ATK" value={params.attack} onChange={(v) => updateParam('attack', v)} disabled={isPlaying} />
                          <Knob label="DCY" value={params.decay} onChange={(v) => updateParam('decay', v)} disabled={isPlaying} />
                          <Knob label="DLY" value={params.delay} onChange={(v) => updateParam('delay', v)} />
                          <Knob label="REV" value={params.reverb} onChange={(v) => updateParam('reverb', v)} />
                          <Knob label="VOL" value={params.volume} onChange={(v) => updateParam('volume', v)} />
                        </div>
                      </div>
                      {/* BPM + Token */}
                      <div className="px-4 py-3 flex items-center gap-4">
                        <div className="flex-1">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[8px] uppercase tracking-wider text-muted-foreground/60" style={font}>BPM</span>
                            <span className="text-[9px] tabular-nums" style={{ ...font, color: PINK }}>{bpm}</span>
                          </div>
                          <input type="range" min={60} max={300} value={bpm}
                            onChange={(e) => setBpm(Number(e.target.value))} disabled={isPlaying}
                            className="w-full h-1 appearance-none bg-neutral-200 dark:bg-neutral-700 accent-[#c27a90] cursor-pointer disabled:opacity-40" />
                        </div>
                        <div className="w-20">
                          <label className="text-[8px] uppercase tracking-wider text-muted-foreground/60 mb-1 block" style={font}>Token</label>
                          <input type="number" min="0" value={tokenId}
                            onChange={(e) => setTokenId(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && fetchAgent()}
                            className="w-full p-1 text-center bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-[10px] text-foreground outline-none"
                            style={font} />
                        </div>
                        <button onClick={() => fetchAgent()} disabled={loading}
                          className="mt-3 px-3 h-7 border border-neutral-300 dark:border-neutral-600 text-[9px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
                          style={font}>GO</button>
                      </div>
                    </div>
                    {/* Footer hint */}
                    <div className="mt-3 flex items-center justify-center gap-2 text-[9px] text-muted-foreground/30" style={font}>
                      <Volume2 className="w-3 h-3" />
                      <span>Headphones recommended</span>
                    </div>
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
