'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft, Play, Square, Circle, Download,
  SkipBack, Shuffle,
} from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';

const font = { fontFamily: 'var(--font-departure-mono)' };
const PINK = '#c27a90';
const GREEN = '#5CAB5E';

// ══════════════════════════════════════════════════════════════
//  CONSTANTS
// ══════════════════════════════════════════════════════════════

const STEPS = 16;

const TRACKS = [
  { id: 'kick',    label: 'KICK',   color: '#c27a90', freq: 60,  wave: 'sine'     as OscillatorType, decay: 0.25 },
  { id: 'snare',   label: 'SNARE',  color: '#887ECB', freq: 180, wave: 'sawtooth' as OscillatorType, decay: 0.18 },
  { id: 'hihat',   label: 'HIHAT',  color: '#6ABFC6', freq: 800, wave: 'square'   as OscillatorType, decay: 0.06 },
  { id: 'openhat', label: 'OHAT',   color: '#9AE29B', freq: 600, wave: 'square'   as OscillatorType, decay: 0.25 },
  { id: 'clap',    label: 'CLAP',   color: '#C9D487', freq: 300, wave: 'sawtooth' as OscillatorType, decay: 0.12 },
  { id: 'bass',    label: 'BASS',   color: '#A1683C', freq: 80,  wave: 'triangle' as OscillatorType, decay: 0.35 },
  { id: 'lead',    label: 'LEAD',   color: '#CB7E75', freq: 440, wave: 'sine'     as OscillatorType, decay: 0.3  },
  { id: 'pad',     label: 'PAD',    color: '#A057A3', freq: 220, wave: 'triangle' as OscillatorType, decay: 0.5  },
] as const;

const SCALES = {
  'Minor': [0, 2, 3, 5, 7, 8, 10],
  'Major': [0, 2, 4, 5, 7, 9, 11],
  'Pentatonic': [0, 3, 5, 7, 10],
  'Blues': [0, 3, 5, 6, 7, 10],
  'Chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};

const ROOT_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const BASE_FREQS: Record<string, number> = {
  'C': 261.63, 'C#': 277.18, 'D': 293.66, 'D#': 311.13,
  'E': 329.63, 'F': 349.23, 'F#': 369.99, 'G': 392.00,
  'G#': 415.30, 'A': 440.00, 'A#': 466.16, 'B': 493.88,
};

type TrackId = typeof TRACKS[number]['id'];
type Grid = Record<TrackId, boolean[]>;
type MelodyGrid = boolean[][];  // [step][noteIdx]

function emptyGrid(): Grid {
  const g = {} as Grid;
  for (const t of TRACKS) g[t.id] = Array(STEPS).fill(false);
  return g;
}

function emptyMelody(noteCount: number): MelodyGrid {
  return Array.from({ length: STEPS }, () => Array(noteCount).fill(false));
}

// ══════════════════════════════════════════════════════════════
//  AUDIO ENGINE
// ══════════════════════════════════════════════════════════════

function buildAudioChain(ctx: AudioContext, reverb: number, delay: number) {
  const master = ctx.createGain();
  master.gain.value = 0.7;

  // Reverb
  const convLen = ctx.sampleRate * 2.5;
  const impulse = ctx.createBuffer(2, convLen, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = impulse.getChannelData(ch);
    for (let i = 0; i < convLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / convLen, 3);
  }
  const conv = ctx.createConvolver();
  conv.buffer = impulse;
  const rvWet = ctx.createGain(); rvWet.gain.value = reverb * 0.5;
  const rvDry = ctx.createGain(); rvDry.gain.value = 1 - reverb * 0.3;
  conv.connect(rvWet);

  // Delay
  const dlyNode = ctx.createDelay(1.0); dlyNode.delayTime.value = delay * 0.4;
  const dlyFb = ctx.createGain(); dlyFb.gain.value = delay * 0.35;
  const dlyWet = ctx.createGain(); dlyWet.gain.value = delay * 0.4;
  dlyNode.connect(dlyFb); dlyFb.connect(dlyNode); dlyNode.connect(dlyWet);

  // Analyser
  const analyser = ctx.createAnalyser(); analyser.fftSize = 512;

  master.connect(rvDry); master.connect(conv); master.connect(dlyNode);
  rvDry.connect(analyser); rvWet.connect(analyser); dlyWet.connect(analyser);
  analyser.connect(ctx.destination);

  return { master, analyser };
}

function triggerDrum(
  ctx: AudioContext,
  master: GainNode,
  track: typeof TRACKS[number],
  vol: number,
  pitch: number,
  time: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 2000 + pitch * 1000;

  osc.type = track.wave;
  const baseFreq = track.freq * (1 + (pitch - 0.5) * 0.4);
  osc.frequency.setValueAtTime(baseFreq, time);
  osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.3, time + track.decay * 0.5);

  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(vol * 0.8, time + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, time + track.decay);

  // Noise burst for snare/clap/hihat
  if (track.id === 'snare' || track.id === 'clap' || track.id === 'hihat' || track.id === 'openhat') {
    const bufLen = ctx.sampleRate * track.decay;
    const noiseBuf = ctx.createBuffer(1, bufLen, ctx.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < bufLen; i++) nd[i] = Math.random() * 2 - 1;
    const noiseSrc = ctx.createBufferSource();
    noiseSrc.buffer = noiseBuf;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0, time);
    noiseGain.gain.linearRampToValueAtTime(vol * 0.5, time + 0.003);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, time + track.decay);
    noiseSrc.connect(noiseGain); noiseGain.connect(filter);
    noiseSrc.start(time); noiseSrc.stop(time + track.decay);
  }

  osc.connect(gain); gain.connect(filter); filter.connect(master);
  osc.start(time); osc.stop(time + track.decay + 0.05);
}

function triggerNote(
  ctx: AudioContext,
  master: GainNode,
  freq: number,
  wave: OscillatorType,
  vol: number,
  decay: number,
  time: number,
) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = wave;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(vol * 0.5, time + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, time + decay);
  osc.connect(gain); gain.connect(master);
  osc.start(time); osc.stop(time + decay + 0.05);
}

// ══════════════════════════════════════════════════════════════
//  WAVEFORM VISUALIZER
// ══════════════════════════════════════════════════════════════

function Waveform({ analyser, isPlaying }: { analyser: AnalyserNode | null; isPlaying: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const raf = useRef<number>(0);

  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const draw = () => {
      raf.current = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (!analyser || !isPlaying) {
        ctx.strokeStyle = '#1f1f1f';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, canvas.height / 2);
        ctx.lineTo(canvas.width, canvas.height / 2);
        ctx.stroke();
        return;
      }
      const buf = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteTimeDomainData(buf);
      ctx.strokeStyle = PINK;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const sliceW = canvas.width / buf.length;
      for (let i = 0; i < buf.length; i++) {
        const v = buf[i] / 128;
        const y = (v * canvas.height) / 2;
        i === 0 ? ctx.moveTo(0, y) : ctx.lineTo(i * sliceW, y);
      }
      ctx.stroke();
    };
    draw();
    return () => cancelAnimationFrame(raf.current);
  }, [analyser, isPlaying]);

  return <canvas ref={ref} width={600} height={48} className="w-full h-12" />;
}

// ══════════════════════════════════════════════════════════════
//  KNOB
// ══════════════════════════════════════════════════════════════

function Knob({ label, value, onChange, color = PINK }: {
  label: string; value: number; onChange: (v: number) => void; color?: string;
}) {
  const startY = useRef(0);
  const startVal = useRef(0);

  const onMouseDown = (e: React.MouseEvent) => {
    startY.current = e.clientY;
    startVal.current = value;
    const onMove = (ev: MouseEvent) => {
      const delta = (startY.current - ev.clientY) / 120;
      onChange(Math.max(0, Math.min(1, startVal.current + delta)));
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const angle = -135 + value * 270;
  return (
    <div className="flex flex-col items-center gap-1 select-none">
      <div
        onMouseDown={onMouseDown}
        className="w-8 h-8 rounded-full border-2 flex items-center justify-center cursor-ns-resize relative"
        style={{ borderColor: color, backgroundColor: '#0a0a0a' }}
      >
        <div className="w-1 h-3 rounded-full absolute bottom-1"
          style={{ backgroundColor: color, transformOrigin: '50% 100%', transform: `rotate(${angle}deg)` }} />
      </div>
      <span className="text-[7px] uppercase tracking-wider" style={{ ...font, color: '#555' }}>{label}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
//  PAD KEY (for synth keyboard)
// ══════════════════════════════════════════════════════════════

function PadKey({ label, freq, color, onTrigger }: {
  label: string; freq: number; color: string; onTrigger: (freq: number) => void;
}) {
  const [active, setActive] = useState(false);
  return (
    <button
      onMouseDown={() => { setActive(true); onTrigger(freq); }}
      onMouseUp={() => setActive(false)}
      onMouseLeave={() => setActive(false)}
      onTouchStart={(e) => { e.preventDefault(); setActive(true); onTrigger(freq); }}
      onTouchEnd={() => setActive(false)}
      className="flex-1 h-16 flex items-end justify-center pb-2 border transition-all text-[8px]"
      style={{
        ...font,
        borderColor: active ? color : '#2a2a2a',
        backgroundColor: active ? color + '33' : '#0d0d0d',
        color: active ? color : '#444',
      }}
    >
      {label}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════
//  PAGE
// ══════════════════════════════════════════════════════════════

export default function DjStudioPage() {
  // Beat sequencer
  const [grid, setGrid] = useState<Grid>(emptyGrid());
  const [trackVols, setTrackVols] = useState<Record<TrackId, number>>(() => {
    const v = {} as Record<TrackId, number>;
    for (const t of TRACKS) v[t.id] = 0.8;
    return v;
  });
  const [trackPitch, setTrackPitch] = useState<Record<TrackId, number>>(() => {
    const v = {} as Record<TrackId, number>;
    for (const t of TRACKS) v[t.id] = 0.5;
    return v;
  });
  const [mutedTracks, setMutedTracks] = useState<Set<TrackId>>(new Set());

  // Melody
  const [scale, setScale] = useState<keyof typeof SCALES>('Minor');
  const [rootNote, setRootNote] = useState('A');
  const [melodyOct, setMelodyOct] = useState(4);
  const [melodyGrid, setMelodyGrid] = useState<MelodyGrid>(() => emptyMelody(SCALES['Minor'].length));
  const [melodyVol, setMelodyVol] = useState(0.6);
  const [melodyWave, setMelodyWave] = useState<OscillatorType>('sine');
  const [melodyDecay, setMelodyDecay] = useState(0.4);

  // Transport
  const [bpm, setBpm] = useState(120);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [swing, setSwing] = useState(0);

  // FX
  const [reverb, setReverb] = useState(0.15);
  const [delay, setDelay] = useState(0.2);
  const [filterFreq, setFilterFreq] = useState(0.8);
  const [masterVol, setMasterVol] = useState(0.75);

  // Recording
  const [isRecording, setIsRecording] = useState(false);
  const [hasRecording, setHasRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recBlobRef = useRef<Blob | null>(null);

  // Audio
  const ctxRef = useRef<AudioContext | null>(null);
  const masterRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const filterRef = useRef<BiquadFilterNode | null>(null);
  const stopRef = useRef(false);
  const stepRef = useRef(0);
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derive scale notes
  const scaleIntervals = SCALES[scale];
  const baseFreq = BASE_FREQS[rootNote] * Math.pow(2, melodyOct - 4);
  const scaleFreqs = scaleIntervals.map(i => baseFreq * Math.pow(2, i / 12));
  const scaleLabels = scaleIntervals.map(i => ROOT_NOTES[(ROOT_NOTES.indexOf(rootNote) + i) % 12]);

  // When scale changes, reset melody grid size
  useEffect(() => {
    setMelodyGrid(emptyMelody(scaleIntervals.length));
  }, [scale, scaleIntervals.length]);

  // ── Audio init ────────────────────────────────────────────
  const ensureCtx = useCallback(() => {
    if (ctxRef.current && ctxRef.current.state !== 'closed') return;
    const ctx = new AudioContext();
    const { master, analyser } = buildAudioChain(ctx, reverb, delay);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 200 + filterFreq * 18000;
    master.connect(filter); filter.connect(ctx.destination);
    // re-wire analyser through filter
    analyser.disconnect();
    analyser.connect(filter);
    ctxRef.current = ctx;
    masterRef.current = master;
    analyserRef.current = analyser;
    filterRef.current = filter;
  }, [reverb, delay, filterFreq]);

  // Update filter freq live
  useEffect(() => {
    if (filterRef.current) filterRef.current.frequency.value = 200 + filterFreq * 18000;
  }, [filterFreq]);

  // Update master volume live
  useEffect(() => {
    if (masterRef.current) masterRef.current.gain.value = masterVol * 0.7;
  }, [masterVol]);

  // ── Sequencer ─────────────────────────────────────────────
  const startSequencer = useCallback(() => {
    ensureCtx();
    stopRef.current = false;
    stepRef.current = 0;
    const ctx = ctxRef.current!;
    const master = masterRef.current!;

    const tick = () => {
      if (stopRef.current) return;
      const step = stepRef.current;
      setCurrentStep(step);

      const beatMs = (60 / bpm) * 1000 / 4;
      const swingMs = step % 2 === 1 ? swing * beatMs * 0.2 : 0;
      const now = ctx.currentTime;

      // Drums
      for (const track of TRACKS) {
        if (mutedTracks.has(track.id)) continue;
        if (grid[track.id][step]) {
          triggerDrum(ctx, master, track, trackVols[track.id], trackPitch[track.id], now);
        }
      }

      // Melody
      for (let ni = 0; ni < scaleFreqs.length; ni++) {
        if (melodyGrid[step]?.[ni]) {
          triggerNote(ctx, master, scaleFreqs[ni], melodyWave, melodyVol, melodyDecay, now);
        }
      }

      stepRef.current = (step + 1) % STEPS;
      intervalRef.current = setTimeout(tick, beatMs + swingMs);
    };

    tick();
    setIsPlaying(true);
  }, [bpm, grid, melodyGrid, mutedTracks, trackVols, trackPitch, scaleFreqs, melodyVol, melodyWave, melodyDecay, swing, ensureCtx]);

  const stopSequencer = useCallback(() => {
    stopRef.current = true;
    if (intervalRef.current) clearTimeout(intervalRef.current);
    setIsPlaying(false);
    setCurrentStep(-1);
  }, []);

  const togglePlay = () => { isPlaying ? stopSequencer() : startSequencer(); };

  useEffect(() => {
    return () => { stopRef.current = true; if (intervalRef.current) clearTimeout(intervalRef.current); ctxRef.current?.close(); };
  }, []);

  // ── Grid helpers ──────────────────────────────────────────
  const toggleCell = (trackId: TrackId, step: number) => {
    setGrid(g => ({ ...g, [trackId]: g[trackId].map((v, i) => i === step ? !v : v) }));
  };
  const toggleMelodyCell = (step: number, ni: number) => {
    setMelodyGrid(g => g.map((row, s) => s === step ? row.map((v, n) => n === ni ? !v : v) : row));
  };
  const toggleMute = (id: TrackId) => {
    setMutedTracks(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };
  const clearAll = () => { setGrid(emptyGrid()); setMelodyGrid(emptyMelody(scaleIntervals.length)); };
  const randomize = () => {
    const g = emptyGrid();
    for (const t of TRACKS) {
      const density = t.id === 'kick' ? 0.3 : t.id === 'hihat' ? 0.5 : 0.2;
      g[t.id] = Array.from({ length: STEPS }, () => Math.random() < density);
    }
    setGrid(g);
  };

  // ── Live pad trigger ──────────────────────────────────────
  const triggerPad = useCallback((freq: number) => {
    ensureCtx();
    const ctx = ctxRef.current!;
    const master = masterRef.current!;
    triggerNote(ctx, master, freq, melodyWave, melodyVol, melodyDecay, ctx.currentTime);
  }, [ensureCtx, melodyWave, melodyVol, melodyDecay]);

  // ── Recording ─────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    ensureCtx();
    const ctx = ctxRef.current!;
    const master = masterRef.current!;

    // Resume AudioContext — required by browser autoplay policy
    if (ctx.state === 'suspended') await ctx.resume();

    // Tap directly from master gain — captures 100% of audio signal
    const dest = ctx.createMediaStreamDestination();
    master.connect(dest);

    // Pick best supported MIME type
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
    const recorder = mimeType
      ? new MediaRecorder(dest.stream, { mimeType })
      : new MediaRecorder(dest.stream);

    chunksRef.current = [];
    recorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      try { master.disconnect(dest); } catch (_) {}
      recBlobRef.current = new Blob(chunksRef.current, { type: mimeType || 'audio/webm' });
      setHasRecording(true);
    };
    recorder.start(250); // collect in 250ms chunks for reliability
    recorderRef.current = recorder;
    setIsRecording(true);
    if (!isPlaying) startSequencer();
  }, [ensureCtx, isPlaying, startSequencer]);

  const stopRecording = useCallback(async () => {
    // Wait 300ms to capture trailing audio before stopping
    await new Promise(resolve => setTimeout(resolve, 300));
    recorderRef.current?.stop();
    setIsRecording(false);
  }, []);

  const downloadRecording = () => {
    if (!recBlobRef.current) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(recBlobRef.current);
    a.download = 'booa-dj-mix.webm';
    a.click();
  };

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="p-4 md:p-8 lg:p-12">
          <div className="w-full lg:grid lg:grid-cols-12">
            <div className="hidden lg:block lg:col-span-1" />
            <div className="lg:col-span-10 space-y-6">

              {/* Back + Title */}
              <div className="space-y-1">
                <Link href="/studio" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors" style={font}>
                  <ArrowLeft className="w-4 h-4" /> Back to Studio
                </Link>
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest" style={font}>BOOA Studio</p>
                <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>DJ Studio</h1>
                <p className="text-sm text-muted-foreground leading-relaxed" style={font}>
                  Build beats, sequence melodies, record your mix.
                </p>
              </div>

              {/* ── TRANSPORT BAR ──────────────────────────── */}
              <div className="border border-neutral-200 dark:border-neutral-800 p-3 flex items-center gap-4 flex-wrap">
                {/* Play/Stop */}
                <button
                  onClick={togglePlay}
                  className="flex items-center gap-2 px-5 py-2 border-2 text-[10px] transition-all"
                  style={{ ...font, borderColor: isPlaying ? PINK : '#404040', color: isPlaying ? PINK : '#aaa', backgroundColor: isPlaying ? PINK + '18' : 'transparent' }}
                >
                  {isPlaying ? <Square className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  {isPlaying ? 'STOP' : 'PLAY'}
                </button>

                {/* Record */}
                <button
                  onClick={isRecording ? stopRecording : startRecording}
                  className="flex items-center gap-2 px-4 py-2 border-2 text-[10px] transition-all"
                  style={{ ...font, borderColor: isRecording ? '#ff4444' : '#404040', color: isRecording ? '#ff4444' : '#aaa', backgroundColor: isRecording ? '#ff444418' : 'transparent' }}
                >
                  <Circle className="w-3 h-3" fill={isRecording ? '#ff4444' : 'none'} />
                  {isRecording ? 'STOP REC' : 'RECORD'}
                </button>

                {hasRecording && (
                  <button onClick={downloadRecording}
                    className="flex items-center gap-2 px-4 py-2 border-2 border-neutral-600 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    style={font}>
                    <Download className="w-3 h-3" /> EXPORT
                  </button>
                )}

                <button onClick={randomize} className="flex items-center gap-2 px-3 py-2 border border-neutral-700 dark:border-neutral-700 text-[10px] text-muted-foreground hover:text-foreground transition-colors" style={font}>
                  <Shuffle className="w-3 h-3" /> RANDOM
                </button>
                <button onClick={clearAll} className="px-3 py-2 border border-neutral-700 text-[10px] text-muted-foreground hover:text-foreground transition-colors" style={font}>
                  CLEAR
                </button>

                <div className="flex-1" />

                {/* BPM */}
                <div className="flex items-center gap-3">
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground" style={font}>BPM</span>
                  <input type="range" min={60} max={200} value={bpm} onChange={e => setBpm(+e.target.value)} disabled={isPlaying}
                    className="w-24 h-1 accent-[#c27a90] disabled:opacity-40" />
                  <span className="text-[11px] tabular-nums w-8" style={{ ...font, color: PINK }}>{bpm}</span>
                </div>

                {/* Swing */}
                <div className="flex items-center gap-3">
                  <span className="text-[9px] uppercase tracking-wider text-muted-foreground" style={font}>SWING</span>
                  <input type="range" min={0} max={1} step={0.01} value={swing} onChange={e => setSwing(+e.target.value)}
                    className="w-16 h-1 accent-[#887ECB]" />
                </div>

                {/* Status dot */}
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: isRecording ? '#ff4444' : isPlaying ? GREEN : '#2a2a2a' }} />
                  <span className="text-[8px] uppercase tracking-wider text-muted-foreground" style={font}>
                    {isRecording ? 'REC' : isPlaying ? 'LIVE' : 'READY'}
                  </span>
                </div>
              </div>

              {/* ── WAVEFORM ───────────────────────────────── */}
              <div className="border border-neutral-200 dark:border-neutral-800 bg-[#0a0a0a] overflow-hidden">
                <Waveform analyser={analyserRef.current} isPlaying={isPlaying} />
              </div>

              {/* ── BEAT SEQUENCER ─────────────────────────── */}
              <div className="border border-neutral-200 dark:border-neutral-800 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[9px] uppercase tracking-widest text-muted-foreground" style={font}>Beat Sequencer</p>
                  {/* Step indicators */}
                  <div className="flex gap-0.5">
                    {Array.from({ length: STEPS }, (_, i) => (
                      <div key={i} className="w-3 h-1 rounded-full transition-colors"
                        style={{ backgroundColor: currentStep === i ? PINK : '#1f1f1f' }} />
                    ))}
                  </div>
                </div>

                {/* Step numbers */}
                <div className="grid mb-1" style={{ gridTemplateColumns: '64px 1fr 64px 64px' }}>
                  <div />
                  <div className="grid" style={{ gridTemplateColumns: `repeat(${STEPS}, 1fr)` }}>
                    {Array.from({ length: STEPS }, (_, i) => (
                      <div key={i} className="text-center text-[7px] text-muted-foreground/30" style={font}>{i + 1}</div>
                    ))}
                  </div>
                </div>

                {/* Tracks */}
                {TRACKS.map(track => {
                  const muted = mutedTracks.has(track.id);
                  return (
                    <div key={track.id} className="grid items-center gap-1 mb-1" style={{ gridTemplateColumns: '64px 1fr 64px 64px' }}>
                      {/* Track label + mute */}
                      <button
                        onClick={() => toggleMute(track.id)}
                        className="text-[8px] uppercase tracking-wider text-left px-1 transition-colors"
                        style={{ ...font, color: muted ? '#2a2a2a' : track.color }}
                      >
                        {track.label}
                      </button>

                      {/* Step buttons */}
                      <div className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${STEPS}, 1fr)` }}>
                        {Array.from({ length: STEPS }, (_, s) => {
                          const active = grid[track.id][s];
                          const isCurrentStep = currentStep === s && isPlaying;
                          return (
                            <button
                              key={s}
                              onClick={() => toggleCell(track.id, s)}
                              className="h-7 transition-all border"
                              style={{
                                backgroundColor: active ? (muted ? '#2a2a2a' : track.color + 'cc') : isCurrentStep ? '#1a1a1a' : '#0d0d0d',
                                borderColor: active ? (muted ? '#2a2a2a' : track.color) : isCurrentStep ? '#333' : '#1a1a1a',
                              }}
                            />
                          );
                        })}
                      </div>

                      {/* Vol knob */}
                      <div className="flex justify-center">
                        <Knob label="VOL" value={trackVols[track.id]} color={track.color}
                          onChange={v => setTrackVols(prev => ({ ...prev, [track.id]: v }))} />
                      </div>

                      {/* Pitch knob */}
                      <div className="flex justify-center">
                        <Knob label="PCH" value={trackPitch[track.id]} color={track.color}
                          onChange={v => setTrackPitch(prev => ({ ...prev, [track.id]: v }))} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* ── MELODY SEQUENCER + LIVE PAD ────────────── */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                {/* Melody sequencer */}
                <div className="md:col-span-2 border border-neutral-200 dark:border-neutral-800 p-4">
                  <div className="flex items-center gap-4 mb-3 flex-wrap">
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground" style={font}>Melody</p>

                    {/* Scale picker */}
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] text-muted-foreground" style={font}>Scale</span>
                      <div className="flex">
                        {(Object.keys(SCALES) as (keyof typeof SCALES)[]).map(s => (
                          <button key={s} onClick={() => setScale(s)}
                            className={`px-2 py-1 border text-[8px] transition-colors ${s === scale ? 'border-neutral-600 dark:border-neutral-400 text-foreground' : 'border-neutral-800 text-muted-foreground/40 hover:text-muted-foreground'}`}
                            style={font}>{s}</button>
                        ))}
                      </div>
                    </div>

                    {/* Root note */}
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] text-muted-foreground" style={font}>Root</span>
                      <select value={rootNote} onChange={e => setRootNote(e.target.value)}
                        className="bg-transparent border border-neutral-700 text-[9px] text-foreground px-2 py-1 outline-none" style={font}>
                        {ROOT_NOTES.map(n => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </div>

                    {/* Octave */}
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] text-muted-foreground" style={font}>Oct</span>
                      <button onClick={() => setMelodyOct(o => Math.max(2, o - 1))} className="w-6 h-6 border border-neutral-700 text-muted-foreground hover:text-foreground text-xs" style={font}>-</button>
                      <span className="text-[9px] w-4 text-center" style={{ ...font, color: PINK }}>{melodyOct}</span>
                      <button onClick={() => setMelodyOct(o => Math.min(7, o + 1))} className="w-6 h-6 border border-neutral-700 text-muted-foreground hover:text-foreground text-xs" style={font}>+</button>
                    </div>
                  </div>

                  {/* Melody grid: notes on Y, steps on X */}
                  <div className="overflow-x-auto">
                    {[...scaleFreqs].reverse().map((freq, revNi) => {
                      const ni = scaleFreqs.length - 1 - revNi;
                      const noteName = scaleLabels[ni];
                      return (
                        <div key={ni} className="grid items-center gap-0.5 mb-0.5" style={{ gridTemplateColumns: `28px repeat(${STEPS}, 1fr)` }}>
                          <span className="text-[7px] text-right pr-1" style={{ ...font, color: '#555' }}>{noteName}</span>
                          {Array.from({ length: STEPS }, (_, s) => {
                            const on = melodyGrid[s]?.[ni];
                            const isCurr = currentStep === s && isPlaying;
                            return (
                              <button key={s} onClick={() => toggleMelodyCell(s, ni)}
                                className="h-6 border transition-all"
                                style={{
                                  backgroundColor: on ? PINK + 'cc' : isCurr ? '#1a1a1a' : '#0d0d0d',
                                  borderColor: on ? PINK : isCurr ? '#333' : '#1a1a1a',
                                }}
                              />
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>

                  {/* Melody params */}
                  <div className="flex items-center gap-4 mt-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-[8px] text-muted-foreground" style={font}>Wave</span>
                      {(['sine', 'triangle', 'sawtooth', 'square'] as OscillatorType[]).map(w => (
                        <button key={w} onClick={() => setMelodyWave(w)}
                          className={`px-2 py-1 border text-[8px] transition-colors ${w === melodyWave ? 'border-neutral-600 dark:border-neutral-400 text-foreground' : 'border-neutral-800 text-muted-foreground/40'}`}
                          style={font}>{w.slice(0, 3).toUpperCase()}</button>
                      ))}
                    </div>
                    <Knob label="VOL" value={melodyVol} color={PINK} onChange={setMelodyVol} />
                    <Knob label="DCY" value={melodyDecay} color={PINK} onChange={setMelodyDecay} />
                  </div>
                </div>

                {/* Right panel: FX + Master */}
                <div className="space-y-4">
                  {/* FX */}
                  <div className="border border-neutral-200 dark:border-neutral-800 p-4">
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-3" style={font}>Effects</p>
                    {[
                      { label: 'REVERB', value: reverb, set: setReverb, color: '#887ECB' },
                      { label: 'DELAY',  value: delay,  set: setDelay,  color: '#6ABFC6' },
                      { label: 'FILTER', value: filterFreq, set: setFilterFreq, color: '#C9D487' },
                      { label: 'MASTER', value: masterVol,  set: setMasterVol,  color: PINK },
                    ].map(fx => (
                      <div key={fx.label} className="flex items-center gap-3 mb-2">
                        <span className="text-[8px] uppercase w-14 text-muted-foreground" style={font}>{fx.label}</span>
                        <input type="range" min={0} max={1} step={0.01} value={fx.value}
                          onChange={e => fx.set(+e.target.value)}
                          className="flex-1 h-1" style={{ accentColor: fx.color }} />
                        <span className="text-[8px] w-8 text-right tabular-nums" style={{ ...font, color: fx.color }}>
                          {Math.round(fx.value * 100)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Reset / step reset */}
                  <div className="border border-neutral-200 dark:border-neutral-800 p-4">
                    <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-3" style={font}>Transport</p>
                    <button onClick={() => { stopSequencer(); stepRef.current = 0; setCurrentStep(-1); }}
                      className="w-full flex items-center justify-center gap-2 py-2 border border-neutral-700 text-[9px] text-muted-foreground hover:text-foreground transition-colors mb-2" style={font}>
                      <SkipBack className="w-3 h-3" /> RESET
                    </button>
                    {isRecording && (
                      <div className="flex items-center gap-2 justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        <span className="text-[8px] text-red-500" style={font}>RECORDING</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── LIVE PAD ───────────────────────────────── */}
              <div className="border border-neutral-200 dark:border-neutral-800 p-4">
                <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-3" style={font}>
                  Live Pad — {rootNote} {scale} (Oct {melodyOct})
                </p>
                <div className="flex gap-1">
                  {scaleFreqs.map((freq, i) => (
                    <PadKey key={i} label={scaleLabels[i]} freq={freq} color={PINK} onTrigger={triggerPad} />
                  ))}
                  {/* Octave up pads */}
                  {scaleFreqs.map((freq, i) => (
                    <PadKey key={`up-${i}`} label={scaleLabels[i] + '\''}  freq={freq * 2} color='#887ECB' onTrigger={triggerPad} />
                  ))}
                </div>
                <p className="text-[8px] text-muted-foreground/30 mt-2 text-center" style={font}>
                  Pink = current octave · Purple = octave up · Click or tap to play live
                </p>
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
