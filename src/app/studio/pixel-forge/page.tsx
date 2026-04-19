'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Pencil, Eraser, Pipette, Download, BoxSelect,
  Wand2, Upload, Loader2, Undo, Trash2, Plus,
  PaintBucket, Eye, EyeOff, Hand, ArrowLeft, Grid3X3, Search,
  Minus, Circle, Square, ChevronUp, ChevronDown, Droplet, Replace, Copy,
} from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { PixelEditor } from '@/components/features/studio/PixelEditor';
import { generatePixelAsset } from '@/lib/pixel-forge/gemini-service';
import { Layer, ToolType, DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT, MAX_CANVAS_SIZE, MIN_CANVAS_SIZE, PALETTE_PRESETS, CANVAS_PRESETS, type GenerationState, type Rect } from '@/lib/pixel-forge/types';
import { sfx } from '@/lib/sounds';

const font = { fontFamily: 'var(--font-departure-mono)' };

function PixelSlider({ label, value, min, max, step = 1, display, onChange }: {
  label: string; value: number; min: number; max: number; step?: number;
  display?: string; onChange: (v: number) => void;
}) {
  const percent = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-[9px] uppercase tracking-[0.15em] text-muted-foreground" style={font}>
        <span>{label}</span>
        <span>{display ?? value}</span>
      </div>
      <div className="relative h-5">
        <div className="absolute left-0 right-0 top-1/2 h-[2px] -translate-y-1/2 bg-foreground/20" />
        <div
          className="absolute top-1/2 h-[8px] w-[8px] -translate-x-1/2 -translate-y-1/2 border border-foreground bg-background"
          style={{ left: `${percent}%` }}
        />
        <input
          type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}

const INITIAL_LAYERS: Layer[] = [
  { id: 'base', name: 'Base Layer', data: null, visible: true, opacity: 1, isLocked: false },
];

export default function PixelForgePage() {
  const [layers, setLayers] = useState<Layer[]>(INITIAL_LAYERS);
  const [activeLayerId, setActiveLayerId] = useState('base');
  const [history, setHistory] = useState<Layer[][]>([INITIAL_LAYERS]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [canvasWidth, setCanvasWidth] = useState(DEFAULT_CANVAS_WIDTH);
  const [canvasHeight, setCanvasHeight] = useState(DEFAULT_CANVAS_HEIGHT);

  const [activePalette, setActivePalette] = useState(PALETTE_PRESETS[0]);
  const [customColors, setCustomColors] = useState<string[]>([]);
  const [originalLayerData, setOriginalLayerData] = useState<Map<string, string>>(new Map());
  const allColors = [...activePalette.colors, ...customColors];

  const [tool, setTool] = useState<ToolType>(ToolType.PENCIL);
  const [brushSize, setBrushSize] = useState(1);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [primaryColor, setPrimaryColor] = useState(PALETTE_PRESETS[0].colors[4]);
  const [zoom, setZoom] = useState(8);
  const [contrast, setContrast] = useState(0);
  const [brightness, setBrightness] = useState(0);
  const [bgOpacity, setBgOpacity] = useState(0.5);
  const [showGrid, setShowGrid] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [genState, setGenState] = useState<GenerationState>({ isGenerating: false, error: null });
  const [apiKey, setApiKey] = useState('');

  // Token import
  const [importCollection, setImportCollection] = useState<'booa' | 'punk' | 'normie'>('booa');
  const [tokenIdInput, setTokenIdInput] = useState('');
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // History
  const pushToHistory = (newLayers: Layer[]) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newLayers);
    if (newHistory.length > 20) newHistory.shift();
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setLayers(newLayers);
  };

  const handleUndo = useCallback(() => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setLayers(history[historyIndex - 1]);
    }
  }, [historyIndex, history]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); handleUndo(); }
      if (e.key === 'Escape') setSelection(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo]);

  // Layer ops
  const handleAddLayer = (name = 'New Layer', data: string | null = null, isOriginal = false) => {
    const newLayer: Layer = {
      id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name, data, visible: true, opacity: 1, isLocked: false,
    };
    if (isOriginal && data) {
      setOriginalLayerData(prev => { const next = new Map(prev); next.set(newLayer.id, data); return next; });
    }
    pushToHistory([newLayer, ...layers]);
    setActiveLayerId(newLayer.id);
  };

  const handleUpdateLayer = (id: string, newData: string) => {
    pushToHistory(layers.map(l => l.id === id ? { ...l, data: newData } : l));
    setOriginalLayerData(prev => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  };

  const handleApplySettings = () => {
    setOriginalLayerData(prev => {
      const next = new Map(prev);
      let changed = false;
      layers.forEach(l => {
        if (l.data && !next.has(l.id)) { next.set(l.id, l.data); changed = true; }
      });
      return changed ? next : prev;
    });
    setQuantizeTrigger(v => v + 1);
  };

  const saveOriginal = (id: string, data: string) => {
    setOriginalLayerData(prev => {
      if (prev.has(id)) return prev;
      const next = new Map(prev);
      next.set(id, data);
      return next;
    });
  };

  const handleClearLayer = () => {
    const active = layers.find(l => l.id === activeLayerId);
    if (!active || active.isLocked) return;
    if (selection && active.data) {
      const cvs = document.createElement('canvas');
      cvs.width = canvasWidth; cvs.height = canvasHeight;
      const ctx = cvs.getContext('2d');
      if (ctx) {
        const img = new Image();
        img.src = active.data;
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
          ctx.clearRect(selection.x, selection.y, selection.w, selection.h);
          handleUpdateLayer(activeLayerId, cvs.toDataURL());
        };
      }
    } else {
      handleUpdateLayer(activeLayerId, '');
    }
  };

  const handleChromaKey = () => {
    const active = layers.find(l => l.id === activeLayerId);
    if (!active || active.isLocked || !active.data) return;
    const cvs = document.createElement('canvas');
    cvs.width = canvasWidth; cvs.height = canvasHeight;
    const ctx = cvs.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
      const d = imageData.data;
      for (let i = 0; i < d.length; i += 4) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const isChroma = r <= 100 && g >= 150 && b <= 100 && g > (r + b) * 1.3;
        if (isChroma) d[i + 3] = 0;
      }
      ctx.putImageData(imageData, 0, 0);
      handleUpdateLayer(activeLayerId, cvs.toDataURL());
      sfx.playSuccess();
    };
    img.src = active.data;
  };

  const handleMoveLayer = (id: string, direction: 'up' | 'down') => {
    const idx = layers.findIndex(l => l.id === id);
    if (idx < 0) return;
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= layers.length) return;
    const newLayers = [...layers];
    [newLayers[idx], newLayers[newIdx]] = [newLayers[newIdx], newLayers[idx]];
    pushToHistory(newLayers);
  };

  const handleDeleteLayer = (id: string) => {
    if (layers.length <= 1) return;
    const newLayers = layers.filter(l => l.id !== id);
    pushToHistory(newLayers);
    if (activeLayerId === id) setActiveLayerId(newLayers[0].id);
  };

  const handleDuplicateLayer = (id: string) => {
    const source = layers.find(l => l.id === id);
    if (!source) return;
    const copy: Layer = {
      ...source,
      id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name: `${source.name} copy`,
      isLocked: false,
    };
    const idx = layers.findIndex(l => l.id === id);
    const newLayers = [...layers.slice(0, idx), copy, ...layers.slice(idx)];
    pushToHistory(newLayers);
    if (source.data) {
      const orig = originalLayerData.get(id);
      if (orig) {
        setOriginalLayerData(prev => { const next = new Map(prev); next.set(copy.id, orig); return next; });
      }
    }
    setActiveLayerId(copy.id);
  };

  const COLLECTIONS = {
    booa: { label: 'BOOA', max: 3333, size: 64 },
    punk: { label: 'CryptoPunk', max: 9999, size: 24 },
    normie: { label: 'Normie', max: 9999, size: 40 },
  } as const;

  const handleImportToken = async () => {
    const id = Number(tokenIdInput);
    const col = COLLECTIONS[importCollection];
    if (!Number.isInteger(id) || id < 0 || id > col.max) {
      setTokenError(`Enter a valid ID (0-${col.max})`);
      return;
    }
    const hasExistingArt = layers.some(l => l.data);
    setTokenLoading(true);
    setTokenError(null);
    try {
      if (importCollection === 'booa') {
        const res = await fetch(`/api/gallery?contract=0x7aecA981734d133d3f695937508C48483BA6b654&chain=shape&startToken=${id}&limit=1`);
        const data = await res.json();
        const token = data.tokens?.find((t: { tokenId: string }) => t.tokenId === String(id));
        if (!token?.svg) { sfx.playError(); setTokenError('Token not found'); return; }
        const svgBlob = new Blob([token.svg], { type: 'image/svg+xml' });
        const url = URL.createObjectURL(svgBlob);
        const img = new Image();
        img.onload = () => {
          const newCanvasW = hasExistingArt ? Math.max(canvasWidth, col.size) : col.size;
          const newCanvasH = hasExistingArt ? Math.max(canvasHeight, col.size) : col.size;
          if (newCanvasW !== canvasWidth || newCanvasH !== canvasHeight) {
            setCanvasWidth(newCanvasW); setCanvasHeight(newCanvasH);
          }
          const cvs = document.createElement('canvas');
          cvs.width = newCanvasW; cvs.height = newCanvasH;
          const ctx = cvs.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, col.size, col.size);
            const pngData = cvs.toDataURL('image/png');
            if (hasExistingArt) {
              handleAddLayer(`BOOA #${id}`, pngData, true);
            } else {
              const active = layers.find(l => l.id === activeLayerId);
              if (active && !active.data) { saveOriginal(activeLayerId, pngData); handleUpdateLayer(activeLayerId, pngData); }
              else handleAddLayer(`BOOA #${id}`, pngData, true);
            }
            sfx.playSuccess();
          }
          URL.revokeObjectURL(url);
        };
        img.onerror = () => { sfx.playError(); setTokenError('Failed to load'); URL.revokeObjectURL(url); };
        img.src = url;
      } else {
        const imgUrl = `/api/pixel-forge-import?collection=${importCollection}&id=${id}`;
        const img = new Image();
        img.onload = () => {
          const newCanvasW = hasExistingArt ? Math.max(canvasWidth, col.size) : col.size;
          const newCanvasH = hasExistingArt ? Math.max(canvasHeight, col.size) : col.size;
          if (newCanvasW !== canvasWidth || newCanvasH !== canvasHeight) {
            setCanvasWidth(newCanvasW); setCanvasHeight(newCanvasH);
          }
          const cvs = document.createElement('canvas');
          cvs.width = newCanvasW; cvs.height = newCanvasH;
          const ctx = cvs.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(img, 0, 0, col.size, col.size);
            if (!hasExistingArt) {
              const imageData = ctx.getImageData(0, 0, col.size, col.size);
              const d = imageData.data;
              const colorSet = new Set<string>();
              for (let i = 0; i < d.length; i += 4) {
                if (d[i + 3] < 128) continue;
                const hex = '#' + ((1 << 24) + (d[i] << 16) + (d[i + 1] << 8) + d[i + 2]).toString(16).slice(1).toUpperCase();
                colorSet.add(hex);
              }
              const extracted = Array.from(colorSet);
              setCustomColors(extracted);
              setActivePalette({ name: '__custom__', colors: [] });
            }
            const pngData = cvs.toDataURL('image/png');
            if (hasExistingArt) {
              handleAddLayer(`${col.label} #${id}`, pngData, true);
            } else {
              const active = layers.find(l => l.id === activeLayerId);
              if (active && !active.data) { saveOriginal(activeLayerId, pngData); handleUpdateLayer(activeLayerId, pngData); }
              else handleAddLayer(`${col.label} #${id}`, pngData, true);
            }
            sfx.playSuccess();
          }
          setTokenLoading(false);
        };
        img.onerror = () => { sfx.playError(); setTokenError('Token not found'); setTokenLoading(false); };
        img.src = imgUrl;
        return;
      }
    } catch {
      setTokenError('Failed to fetch token');
    } finally {
      setTokenLoading(false);
    }
  };

  // Composite image for AI + download
  const getCompositeImage = async (): Promise<string> => {
    const cvs = document.createElement('canvas');
    cvs.width = canvasWidth; cvs.height = canvasHeight;
    const ctx = cvs.getContext('2d');
    if (!ctx) throw new Error('Cannot create context');
    for (const layer of [...layers].reverse()) {
      if (layer.visible && layer.data) {
        const img = new Image();
        img.src = layer.data;
        await new Promise<void>(r => { img.onload = () => { ctx.globalAlpha = layer.opacity; ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight); r(); }; img.onerror = () => r(); });
      }
    }
    return cvs.toDataURL('image/png');
  };

  const quantizeToPalette = (ctx: CanvasRenderingContext2D, w: number, h: number, c = 0, b = 0) => {
    const imageData = ctx.getImageData(0, 0, w, h);
    const d = imageData.data;
    if (c !== 0 || b !== 0) {
      const factor = (259 * (c + 255)) / (255 * (259 - c));
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] < 128) continue;
        d[i]     = Math.max(0, Math.min(255, factor * (d[i] - 128) + 128 + b));
        d[i + 1] = Math.max(0, Math.min(255, factor * (d[i + 1] - 128) + 128 + b));
        d[i + 2] = Math.max(0, Math.min(255, factor * (d[i + 2] - 128) + 128 + b));
      }
    }
    const palette = allColors.map(hex => [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ]);
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) { d[i + 3] = 0; continue; }
      let bestDist = Infinity, bestIdx = 0;
      for (let p = 0; p < palette.length; p++) {
        const dr = d[i] - palette[p][0];
        const dg = d[i + 1] - palette[p][1];
        const db = d[i + 2] - palette[p][2];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) { bestDist = dist; bestIdx = p; }
      }
      d[i] = palette[bestIdx][0];
      d[i + 1] = palette[bestIdx][1];
      d[i + 2] = palette[bestIdx][2];
      d[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
  };

  const [quantizeTrigger, setQuantizeTrigger] = useState(0);
  const quantizeKey = `${contrast}|${brightness}|${quantizeTrigger}`;
  const isFirstRender = useRef(true);
  const layersRef = useRef(layers);
  const originalsRef = useRef(originalLayerData);
  layersRef.current = layers;
  originalsRef.current = originalLayerData;

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return; }
    const currentLayers = layersRef.current;
    const originals = originalsRef.current;
    const hasOriginals = currentLayers.some(l => originals.has(l.id));
    if (!hasOriginals) return;

    const colors = [...activePalette.colors, ...customColors];

    const applyQuantize = () => {
      const updated = [...currentLayers];
      let changed = false;
      let pending = 0;
      const done = () => {
        pending--;
        if (pending <= 0 && changed) pushToHistory(updated);
      };
      currentLayers.forEach((layer, idx) => {
        const src = originals.get(layer.id);
        if (!src) return;
        if (colors.length === 0) {
          if (layer.data !== src) { updated[idx] = { ...layer, data: src }; changed = true; }
          return;
        }
        pending++;
        const img = new Image();
        img.src = src;
        img.onload = () => {
          const w = img.naturalWidth || canvasWidth;
          const h = img.naturalHeight || canvasHeight;
          const cvs = document.createElement('canvas');
          cvs.width = w; cvs.height = h;
          const ctx = cvs.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            quantizeToPalette(ctx, w, h, contrast, brightness);
            updated[idx] = { ...layer, data: cvs.toDataURL('image/png') };
            changed = true;
          }
          done();
        };
        img.onerror = () => done();
      });
      if (pending === 0 && changed) pushToHistory(updated);
    };
    applyQuantize();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantizeKey]);

  // AI generation
  const handleGenerate = async () => {
    if (!prompt.trim() || !apiKey.trim()) {
      setGenState({ isGenerating: false, error: !apiKey.trim() ? 'Enter your Gemini API key.' : null });
      return;
    }
    setGenState({ isGenerating: true, error: null });
    try {
      const composite = await getCompositeImage();
      const hasExistingArt = layers.some(l => l.visible && l.data);
      const result = await generatePixelAsset(
        apiKey,
        prompt,
        canvasWidth,
        canvasHeight,
        [],
        composite,
        selection,
        hasExistingArt,
      );
      const img = new Image();
      img.src = result;
      await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); });
      const cvs = document.createElement('canvas');
      cvs.width = canvasWidth; cvs.height = canvasHeight;
      const ctx = cvs.getContext('2d');
      if (ctx) {
          ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
          const origData = cvs.toDataURL('image/png');
          const layerName = `AI: ${prompt}`;
          const newId = `layer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          const newLayer: Layer = { id: newId, name: layerName, data: origData, visible: true, opacity: 1, isLocked: false };
          setOriginalLayerData(prev => { const next = new Map(prev); next.set(newId, origData); return next; });
          pushToHistory([newLayer, ...layers]);
          setActiveLayerId(newId);
        }
      sfx.playSuccess();
    } catch (e) {
      sfx.playError();
      setGenState({ isGenerating: false, error: e instanceof Error ? e.message : 'Generation failed' });
    } finally {
      setGenState(prev => ({ ...prev, isGenerating: false }));
    }
  };

  // Upload
  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const hasExistingArt = layers.some(l => l.data);
    if (!hasExistingArt) {
      const fullColor = PALETTE_PRESETS.find(p => p.name === 'Full Color');
      if (fullColor) setActivePalette(fullColor);
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const FIT = Math.max(canvasWidth, canvasHeight);
        const ratio = img.naturalWidth / img.naturalHeight;
        let fitW: number, fitH: number;
        if (ratio >= 1) {
          fitW = Math.min(FIT, img.naturalWidth);
          fitH = Math.round(fitW / ratio);
        } else {
          fitH = Math.min(FIT, img.naturalHeight);
          fitW = Math.round(fitH * ratio);
        }
        fitW = Math.max(MIN_CANVAS_SIZE, Math.min(MAX_CANVAS_SIZE, fitW));
        fitH = Math.max(MIN_CANVAS_SIZE, Math.min(MAX_CANVAS_SIZE, fitH));
        const newCanvasW = hasExistingArt ? Math.max(canvasWidth, fitW) : fitW;
        const newCanvasH = hasExistingArt ? Math.max(canvasHeight, fitH) : fitH;
        if (newCanvasW !== canvasWidth || newCanvasH !== canvasHeight) {
          setCanvasWidth(newCanvasW); setCanvasHeight(newCanvasH);
        }
        const cvs = document.createElement('canvas');
        cvs.width = newCanvasW; cvs.height = newCanvasH;
        const ctx = cvs.getContext('2d');
        if (ctx) { ctx.imageSmoothingEnabled = false; ctx.drawImage(img, 0, 0, fitW, fitH); }
        const data = cvs.toDataURL('image/png');
        if (hasExistingArt) {
          handleAddLayer(file.name, data, true);
        } else {
          const active = layers.find(l => l.id === activeLayerId);
          if (active && !active.data) { saveOriginal(activeLayerId, data); handleUpdateLayer(activeLayerId, data); }
          else handleAddLayer(file.name, data, true);
        }
        sfx.playSuccess();
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const [downloadScale, setDownloadScale] = useState(1);
  const SCALE_OPTIONS = [1, 2, 4, 8, 16, 32];

  const handleDownload = async () => {
    const composite = await getCompositeImage();
    const sizeW = canvasWidth * downloadScale;
    const sizeH = canvasHeight * downloadScale;
    const cvs = document.createElement('canvas');
    cvs.width = sizeW; cvs.height = sizeH;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, sizeW, sizeH);
      const link = document.createElement('a');
      link.download = `pixel-forge-${sizeW}x${sizeH}.png`;
      link.href = cvs.toDataURL('image/png');
      link.click();
    };
    img.src = composite;
  };

  const activeLayer = layers.find(l => l.id === activeLayerId);

  const tools = [
    { type: ToolType.PENCIL, icon: Pencil, label: 'Pencil' },
    { type: ToolType.ERASER, icon: Eraser, label: 'Eraser' },
    { type: ToolType.FILL, icon: PaintBucket, label: 'Fill' },
    { type: ToolType.FILL_SAME, icon: Replace, label: 'Fill same' },
    { type: ToolType.EYEDROPPER, icon: Pipette, label: 'Picker' },
    { type: ToolType.LINE, icon: Minus, label: 'Line' },
    { type: ToolType.RECTANGLE, icon: Square, label: 'Rect' },
    { type: ToolType.CIRCLE, icon: Circle, label: 'Circle' },
    { type: ToolType.MOVE, icon: Hand, label: 'Pan' },
    { type: ToolType.SELECT, icon: BoxSelect, label: 'Select' },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="p-4 md:p-8 lg:p-12">
          <div className="w-full lg:grid lg:grid-cols-12">
            <div className="hidden lg:block lg:col-span-1" />
            <div className="lg:col-span-10 space-y-6">

              <Link
                href="/studio"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                style={font}
              >
                <ArrowLeft className="w-4 h-4" />
                Back to Studio
              </Link>

              <div className="space-y-3">
                <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest" style={font}>
                  BOOA Studio
                </p>
                <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>
                  Pixel Forge
                </h1>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-lg" style={font}>
                  Import your BOOA, draw over it, generate new assets with AI. Same palette, your creativity.
                </p>
              </div>

          {/* Layout */}
          <div className="flex flex-col lg:flex-row gap-4">

            {/* Left sidebar */}
            <div className="w-full lg:w-56 space-y-3 shrink-0">

              {/* Import Token */}
              <div className="border-2 border-neutral-700 dark:border-neutral-200 p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50" style={font}>Import</p>
                <div className="flex gap-0.5">
                  {(Object.keys(COLLECTIONS) as Array<keyof typeof COLLECTIONS>).map(key => (
                    <button
                      key={key}
                      onClick={() => { sfx.playClick(); setImportCollection(key); setTokenError(null); }}
                      className={`flex-1 py-1 text-[9px] uppercase border transition-colors ${
                        importCollection === key
                          ? 'border-foreground bg-foreground/10 text-foreground'
                          : 'border-neutral-700 dark:border-neutral-600 text-muted-foreground/50 hover:border-foreground/50'
                      }`}
                      style={font}
                    >
                      {COLLECTIONS[key].label}
                    </button>
                  ))}
                </div>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={tokenIdInput}
                    onChange={e => setTokenIdInput(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={e => e.key === 'Enter' && handleImportToken()}
                    placeholder={`ID (0-${COLLECTIONS[importCollection].max})`}
                    className="flex-1 border border-neutral-700 dark:border-neutral-600 bg-background px-2 py-1.5 text-[10px] focus:outline-none focus:border-foreground text-foreground placeholder:text-muted-foreground/30"
                    style={font}
                  />
                  <button
                    onClick={() => { sfx.playClick(); handleImportToken(); }}
                    disabled={tokenLoading || !tokenIdInput}
                    className="border border-neutral-700 dark:border-neutral-600 px-2 py-1.5 hover:bg-foreground/5 disabled:opacity-30 transition-colors"
                  >
                    {tokenLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  </button>
                </div>
                {tokenError && <p className="text-[9px] text-red-400" style={font}>{tokenError}</p>}
              </div>

              {/* Upload file */}
              <div className="border-2 border-neutral-700 dark:border-neutral-200 p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50" style={font}>Upload</p>
                <div
                  className="border border-dashed border-neutral-600 dark:border-neutral-400 p-3 text-center cursor-pointer hover:border-foreground/50 transition-colors"
                  onClick={() => { sfx.playClick(); fileInputRef.current?.click(); }}
                >
                  <Upload className="w-4 h-4 mx-auto mb-1 text-muted-foreground" />
                  <p className="text-[9px] text-muted-foreground" style={font}>PNG, JPG, WEBP</p>
                </div>
                <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleUpload} />
              </div>

              {/* Tools */}
              <div className="border-2 border-neutral-700 dark:border-neutral-200 p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50" style={font}>Tools</p>
                <div className="grid grid-cols-4 gap-1">
                  {tools.map(({ type, icon: Icon, label }) => (
                    <button
                      key={type}
                      onClick={() => { sfx.playClick(); setTool(type); if (type !== ToolType.SELECT && type !== ToolType.MOVE) setSelection(null); }}
                      className={`p-2 border transition-colors ${tool === type ? 'border-foreground bg-foreground/10' : 'border-neutral-700 dark:border-neutral-600 hover:border-foreground/50'}`}
                      title={label}
                    >
                      <Icon className="w-3.5 h-3.5 mx-auto" />
                    </button>
                  ))}
                  <button
                    onClick={() => { sfx.playToggle(!showGrid); setShowGrid(!showGrid); }}
                    className={`p-2 border transition-colors ${showGrid ? 'border-foreground bg-foreground/10' : 'border-neutral-700 dark:border-neutral-600 hover:border-foreground/50'}`}
                    title="Grid"
                  >
                    <Grid3X3 className="w-3.5 h-3.5 mx-auto" />
                  </button>
                  <button
                    onClick={() => { sfx.playClick(); handleChromaKey(); }}
                    className="p-2 border border-neutral-700 dark:border-neutral-600 hover:border-foreground/50 transition-colors"
                    title="Remove green background"
                  >
                    <Droplet className="w-3.5 h-3.5 mx-auto" />
                  </button>
                </div>

                {/* Palette selector */}
                <div className="mt-2">
                  <div className="flex items-center gap-1 mb-1">
                    <select
                      value={activePalette.name}
                      onChange={e => {
                        sfx.playSelect();
                        if (e.target.value === '__custom__') {
                          setActivePalette({ name: '__custom__', colors: [] });
                        } else {
                          const p = PALETTE_PRESETS.find(p => p.name === e.target.value);
                          if (p) setActivePalette(p);
                        }
                      }}
                      className="flex-1 bg-transparent border border-neutral-700 dark:border-neutral-600 text-[9px] text-foreground px-1 py-0.5 cursor-pointer focus:outline-none"
                      style={font}
                    >
                      {PALETTE_PRESETS.map(p => (
                        <option key={p.name} value={p.name}>{p.name} ({p.colors.length})</option>
                      ))}
                      {customColors.length > 0 && (
                        <option value="__custom__">Custom ({customColors.length})</option>
                      )}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-8 gap-0.5">
                  {activePalette.colors.map((color, i) => (
                    <div key={`p-${i}`} className="relative group">
                      <button
                        onClick={() => { sfx.playClick(); setPrimaryColor(color); }}
                        className={`w-full aspect-square border ${primaryColor === color ? 'border-foreground ring-1 ring-foreground' : 'border-neutral-700 dark:border-neutral-600'}`}
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                      <button
                        onClick={e => {
                          e.stopPropagation(); sfx.playClick();
                          const remaining = activePalette.colors.filter((_, j) => j !== i);
                          setCustomColors([...remaining, ...customColors]);
                          setActivePalette({ name: '__custom__', colors: [] });
                        }}
                        className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 text-white text-[7px] leading-none rounded-full hidden group-hover:flex items-center justify-center"
                      >
                        x
                      </button>
                    </div>
                  ))}
                  {customColors.map((color, i) => (
                    <div key={`c-${i}`} className="relative group">
                      {color ? (
                        <button
                          onClick={() => { sfx.playClick(); setPrimaryColor(color); }}
                          className={`w-full aspect-square border ${primaryColor === color ? 'border-foreground ring-1 ring-foreground' : 'border-neutral-700 dark:border-neutral-600'}`}
                          style={{ backgroundColor: color }}
                          title={color}
                        />
                      ) : (
                        <label
                          className="relative block w-full aspect-square border border-dashed border-foreground/40 cursor-pointer hover:border-foreground transition-colors"
                          style={{
                            backgroundImage: 'linear-gradient(45deg, #888 25%, transparent 25%), linear-gradient(-45deg, #888 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #888 75%), linear-gradient(-45deg, transparent 75%, #888 75%)',
                            backgroundSize: '6px 6px',
                            backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0px',
                          }}
                          title="Pick a color"
                        >
                          <input
                            type="color"
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            onChange={e => { sfx.playClick(); const c = e.target.value; setCustomColors(prev => prev.map((cc, j) => j === i ? c : cc)); setPrimaryColor(c); }}
                          />
                        </label>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); sfx.playClick(); setCustomColors(prev => prev.filter((_, j) => j !== i)); }}
                        className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 text-white text-[7px] leading-none rounded-full hidden group-hover:flex items-center justify-center"
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>

                {/* Custom color + transparent */}
                <div className="flex gap-1 items-center mt-1.5">
                  <input
                    type="color"
                    value={primaryColor === 'transparent' ? '#ffffff' : primaryColor}
                    onChange={e => { sfx.playClick(); setPrimaryColor(e.target.value); }}
                    className="h-6 w-8 border border-neutral-700 dark:border-neutral-600 bg-background cursor-pointer"
                    title="Pick color"
                  />
                  <button
                    onClick={() => {
                      sfx.playClick();
                      setCustomColors(prev => [...prev, '']);
                      setActivePalette({ name: '__custom__', colors: [] });
                    }}
                    className="border border-neutral-700 dark:border-neutral-600 px-1.5 h-6 text-[9px] hover:border-foreground/50 transition-colors"
                    style={font}
                    title="Add a new color slot"
                  >
                    <Plus className="w-2.5 h-2.5" />
                  </button>
                  <button
                    onClick={() => { sfx.playClick(); setPrimaryColor('transparent'); }}
                    className={`flex-1 h-6 border text-[9px] uppercase ${primaryColor === 'transparent' ? 'border-foreground ring-1 ring-foreground' : 'border-neutral-700 dark:border-neutral-600 hover:border-foreground/50'}`}
                    style={{
                      ...font,
                      backgroundImage: 'linear-gradient(45deg, #888 25%, transparent 25%), linear-gradient(-45deg, #888 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #888 75%), linear-gradient(-45deg, transparent 75%, #888 75%)',
                      backgroundSize: '6px 6px',
                      backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0px',
                    }}
                    title="Transparent"
                  >
                    None
                  </button>
                </div>

                <div className="mt-2 space-y-2">
                  <PixelSlider label="Brush" value={brushSize} min={1} max={10} display={`${brushSize}px`} onChange={v => { setBrushSize(v); sfx.playSlider(v / 10); }} />
                  <PixelSlider label="Zoom" value={zoom} min={4} max={16} display={`${zoom}x`} onChange={v => { setZoom(v); sfx.playSlider(v / 16); }} />
                  <PixelSlider label="Contrast" value={contrast} min={-128} max={128} onChange={setContrast} />
                  <PixelSlider label="Brightness" value={brightness} min={-128} max={128} onChange={setBrightness} />
                </div>

                <div className="flex gap-1">
                  <button
                    onClick={() => { sfx.playClick(); handleApplySettings(); }}
                    className="flex-1 border border-neutral-700 dark:border-neutral-600 p-1 text-[9px] uppercase hover:bg-foreground/5 transition-colors"
                    style={font}
                  >
                    Apply
                  </button>
                  {(contrast !== 0 || brightness !== 0) && (
                    <button
                      onClick={() => { sfx.playClick(); setContrast(0); setBrightness(0); }}
                      className="flex-1 border border-neutral-700 dark:border-neutral-600 p-1 text-[9px] uppercase hover:bg-foreground/5 transition-colors"
                      style={font}
                    >
                      Reset
                    </button>
                  )}
                </div>

                <PixelSlider label="BG Opacity" value={bgOpacity} min={0} max={1} step={0.1} display={`${Math.round(bgOpacity * 100)}%`} onChange={v => { setBgOpacity(v); sfx.playSlider(v); }} />
              </div>

              {/* Layers */}
              <div className="border-2 border-neutral-700 dark:border-neutral-200 p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50" style={font}>Layers ({layers.length})</p>
                  <button onClick={() => { sfx.playClick(); handleAddLayer(); }} className="text-muted-foreground hover:text-foreground"><Plus className="w-3 h-3" /></button>
                </div>
                {activeLayer && (
                  <div className="pb-1 mb-1 border-b border-neutral-700/40 dark:border-neutral-600/40">
                    <PixelSlider
                      label="Layer Opacity"
                      value={activeLayer.opacity}
                      min={0}
                      max={1}
                      step={0.05}
                      display={`${Math.round(activeLayer.opacity * 100)}%`}
                      onChange={v => { sfx.playSlider(v); setLayers(prev => prev.map(l => l.id === activeLayerId ? { ...l, opacity: v } : l)); }}
                    />
                  </div>
                )}
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {layers.map(layer => (
                    <div
                      key={layer.id}
                      onClick={() => { sfx.playClick(); setActiveLayerId(layer.id); }}
                      className={`flex items-center gap-2 p-1.5 text-[10px] cursor-pointer border transition-colors ${layer.id === activeLayerId ? 'border-foreground bg-foreground/5' : 'border-transparent hover:border-neutral-700 dark:hover:border-neutral-600'}`}
                      style={font}
                    >
                      <button onClick={e => { e.stopPropagation(); sfx.playToggle(!layer.visible); setLayers(prev => prev.map(l => l.id === layer.id ? { ...l, visible: !l.visible } : l)); }}>
                        {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3 text-muted-foreground/30" />}
                      </button>
                      <span className="truncate flex-1">{layer.name}</span>
                      <div className="flex gap-0.5">
                        <button onClick={e => { e.stopPropagation(); sfx.playClick(); handleMoveLayer(layer.id, 'up'); }} className="text-muted-foreground/30 hover:text-foreground" title="Move up">
                          <ChevronUp className="w-3 h-3" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); sfx.playClick(); handleMoveLayer(layer.id, 'down'); }} className="text-muted-foreground/30 hover:text-foreground" title="Move down">
                          <ChevronDown className="w-3 h-3" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); sfx.playClick(); handleDuplicateLayer(layer.id); }} className="text-muted-foreground/30 hover:text-foreground" title="Duplicate layer">
                          <Copy className="w-3 h-3" />
                        </button>
                        {layers.length > 1 && (
                          <button onClick={e => { e.stopPropagation(); sfx.playClick(); handleDeleteLayer(layer.id); }} className="text-muted-foreground/30 hover:text-red-500" title="Delete layer">
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="border-2 border-neutral-700 dark:border-neutral-200 p-3 space-y-1.5">
                <button onClick={() => { sfx.playClick(); handleUndo(); }} disabled={historyIndex === 0} className="w-full flex items-center justify-center gap-2 border border-neutral-700 dark:border-neutral-600 p-1.5 text-[10px] uppercase disabled:opacity-30 hover:bg-foreground/5 transition-colors" style={font}>
                  <Undo className="w-3 h-3" /> Undo
                </button>
                <button onClick={() => { sfx.playClick(); handleClearLayer(); }} disabled={!activeLayer || activeLayer.isLocked} className="w-full flex items-center justify-center gap-2 border border-neutral-700 dark:border-neutral-600 p-1.5 text-[10px] uppercase disabled:opacity-30 hover:bg-red-500/10 transition-colors" style={font}>
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
                <div className="flex gap-1">
                  <select
                    value={downloadScale}
                    onChange={e => { sfx.playSelect(); setDownloadScale(Number(e.target.value)); }}
                    className="border border-neutral-700 dark:border-neutral-600 bg-background px-1.5 py-1.5 text-[10px] focus:outline-none text-foreground"
                    style={font}
                  >
                    {SCALE_OPTIONS.map(s => (
                      <option key={s} value={s}>{s}x ({canvasWidth * s}x{canvasHeight * s}px)</option>
                    ))}
                  </select>
                  <button onClick={() => { sfx.playSuccess(); handleDownload(); }} className="flex-1 flex items-center justify-center gap-2 border-2 border-neutral-700 dark:border-neutral-200 p-1.5 text-[10px] uppercase hover:bg-foreground/5 transition-colors" style={font}>
                    <Download className="w-3 h-3" /> PNG
                  </button>
                </div>
              </div>
            </div>

            {/* Canvas */}
            <div className="flex-1 border-2 border-neutral-700 dark:border-neutral-200 bg-muted/20 overflow-hidden min-h-[400px] lg:h-[calc(100vh-220px)] lg:max-h-[900px] lg:self-start flex flex-col">
              <div className="border-b border-neutral-200 dark:border-neutral-700 px-3 py-1.5 flex justify-between items-center gap-2">
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={MIN_CANVAS_SIZE}
                    max={MAX_CANVAS_SIZE}
                    value={canvasWidth}
                    onChange={e => setCanvasWidth(Math.min(MAX_CANVAS_SIZE, Math.max(MIN_CANVAS_SIZE, Number(e.target.value) || MIN_CANVAS_SIZE)))}
                    className="w-9 bg-transparent border border-neutral-700 dark:border-neutral-600 px-1 py-0.5 text-[9px] text-foreground text-center focus:outline-none focus:border-foreground"
                    style={font}
                  />
                  <span className="text-[9px] text-muted-foreground/40" style={font}>x</span>
                  <input
                    type="number"
                    min={MIN_CANVAS_SIZE}
                    max={MAX_CANVAS_SIZE}
                    value={canvasHeight}
                    onChange={e => setCanvasHeight(Math.min(MAX_CANVAS_SIZE, Math.max(MIN_CANVAS_SIZE, Number(e.target.value) || MIN_CANVAS_SIZE)))}
                    className="w-9 bg-transparent border border-neutral-700 dark:border-neutral-600 px-1 py-0.5 text-[9px] text-foreground text-center focus:outline-none focus:border-foreground"
                    style={font}
                  />
                </div>
                <div className="flex gap-px">
                  {CANVAS_PRESETS.map(s => (
                    <button
                      key={s}
                      onClick={() => { sfx.playClick(); setCanvasWidth(s); setCanvasHeight(s); }}
                      className={`px-1 py-0.5 text-[8px] border transition-colors ${
                        canvasWidth === s && canvasHeight === s
                          ? 'border-foreground bg-foreground/10 text-foreground'
                          : 'border-neutral-700 dark:border-neutral-600 text-muted-foreground/40 hover:border-foreground/50'
                      }`}
                      style={font}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex-1 overflow-hidden">
                <PixelEditor
                  layers={layers}
                  activeLayerId={activeLayerId}
                  activeTool={tool}
                  primaryColor={primaryColor}
                  brushSize={brushSize}
                  zoom={zoom}
                  bgOpacity={bgOpacity}
                  showGrid={showGrid}
                  canvasWidth={canvasWidth}
                  canvasHeight={canvasHeight}
                  onUpdateLayer={handleUpdateLayer}
                  onPickColor={c => { setPrimaryColor(c); setTool(ToolType.PENCIL); }}
                  selection={selection}
                  setSelection={setSelection}
                />
              </div>
            </div>

            {/* Right sidebar */}
            <div className="w-full lg:w-56 space-y-3 shrink-0">
              {/* AI Generate */}
              <div className="border-2 border-neutral-700 dark:border-neutral-200 p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 flex items-center gap-1" style={font}>
                  <Wand2 className="w-3 h-3" /> AI Generate
                </p>
                <textarea
                  className="w-full bg-background border border-neutral-700 dark:border-neutral-600 p-2 text-[10px] resize-none h-20 focus:outline-none focus:border-foreground text-foreground placeholder:text-muted-foreground/30"
                  placeholder="Describe what to generate..."
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  style={font}
                />
                {genState.error && <p className="text-[9px] text-red-400" style={font}>{genState.error}</p>}
                <button
                  onClick={() => { sfx.playClick(); handleGenerate(); }}
                  disabled={genState.isGenerating || !prompt.trim()}
                  className="w-full flex items-center justify-center gap-2 border-2 border-neutral-700 dark:border-neutral-200 p-2 text-[10px] uppercase disabled:opacity-30 hover:bg-foreground/5 transition-colors"
                  style={font}
                >
                  {genState.isGenerating ? <><Loader2 className="w-3 h-3 animate-spin" /> Generating...</> : <><Wand2 className="w-3 h-3" /> Generate</>}
                </button>
              </div>

              {/* API Key */}
              <div className="border-2 border-neutral-700 dark:border-neutral-200 p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50" style={font}>Gemini API Key</p>
                <input
                  type="password"
                  value={apiKey}
                  onChange={e => setApiKey(e.target.value.trim())}
                  placeholder="Paste your key..."
                  className="w-full bg-background border border-neutral-700 dark:border-neutral-600 px-2 py-1.5 text-[10px] focus:outline-none focus:border-foreground text-foreground placeholder:text-muted-foreground/30"
                  style={font}
                />
                {apiKey && <p className="text-[9px] text-green-600 dark:text-green-400" style={font}>&#10003; Key set</p>}
                <p className="text-[8px] text-muted-foreground/30" style={font}>
                  Never stored. Get one at ai.google.dev
                </p>
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
