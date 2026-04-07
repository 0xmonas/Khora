'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Pencil, Eraser, Pipette, Download, BoxSelect,
  Wand2, Upload, Loader2, Undo, Trash2, Plus,
  PaintBucket, Eye, EyeOff, Hand, ArrowLeft, Grid3X3, Search,
  Minus, Circle, Square, ChevronUp, ChevronDown, Droplet,
} from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { PixelEditor } from '@/components/features/studio/PixelEditor';
import { generatePixelAsset } from '@/lib/pixel-forge/gemini-service';
import { Layer, ToolType, CANVAS_SIZE, C64_PALETTE, type GenerationState, type Rect } from '@/lib/pixel-forge/types';
import { sfx } from '@/lib/sounds';

const font = { fontFamily: 'var(--font-departure-mono)' };

const INITIAL_LAYERS: Layer[] = [
  { id: 'base', name: 'Base Layer', data: null, visible: true, opacity: 1, isLocked: false },
];

export default function PixelForgePage() {
  const [layers, setLayers] = useState<Layer[]>(INITIAL_LAYERS);
  const [activeLayerId, setActiveLayerId] = useState('base');
  const [history, setHistory] = useState<Layer[][]>([INITIAL_LAYERS]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [tool, setTool] = useState<ToolType>(ToolType.PENCIL);
  const [brushSize, setBrushSize] = useState(1);
  const [selection, setSelection] = useState<Rect | null>(null);
  const [primaryColor, setPrimaryColor] = useState(C64_PALETTE[4]); // White
  const [zoom, setZoom] = useState(8);
  const [bgOpacity, setBgOpacity] = useState(0.5);
  const [showGrid, setShowGrid] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [genState, setGenState] = useState<GenerationState>({ isGenerating: false, error: null });
  const [apiKey, setApiKey] = useState('');

  // Token import
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
  const handleAddLayer = (name = 'New Layer', data: string | null = null) => {
    const newLayer: Layer = {
      id: `layer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      name, data, visible: true, opacity: 1, isLocked: false,
    };
    pushToHistory([newLayer, ...layers]);
    setActiveLayerId(newLayer.id);
  };

  const handleUpdateLayer = (id: string, newData: string) => {
    pushToHistory(layers.map(l => l.id === id ? { ...l, data: newData } : l));
  };

  const handleClearLayer = () => {
    const active = layers.find(l => l.id === activeLayerId);
    if (!active || active.isLocked) return;
    if (selection && active.data) {
      const cvs = document.createElement('canvas');
      cvs.width = CANVAS_SIZE; cvs.height = CANVAS_SIZE;
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
    cvs.width = CANVAS_SIZE; cvs.height = CANVAS_SIZE;
    const ctx = cvs.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
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

  // Import BOOA NFT by token ID
  const handleImportToken = async () => {
    const id = Number(tokenIdInput);
    if (!Number.isInteger(id) || id < 0 || id > 3333) {
      setTokenError('Enter a valid token ID (0-3333)');
      return;
    }
    setTokenLoading(true);
    setTokenError(null);
    try {
      const res = await fetch(`/api/gallery?contract=0x7aecA981734d133d3f695937508C48483BA6b654&chain=shape&startToken=${id}&limit=1`);
      const data = await res.json();
      const token = data.tokens?.find((t: { tokenId: string }) => t.tokenId === String(id));
      if (!token?.svg) { sfx.playError(); setTokenError('Token not found'); return; }

      // SVG to canvas to PNG
      const svgBlob = new Blob([token.svg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      img.onload = () => {
        const cvs = document.createElement('canvas');
        cvs.width = CANVAS_SIZE; cvs.height = CANVAS_SIZE;
        const ctx = cvs.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
          const pngData = cvs.toDataURL('image/png');
          const active = layers.find(l => l.id === activeLayerId);
          if (active && !active.data) handleUpdateLayer(activeLayerId, pngData);
          else handleAddLayer(`BOOA #${id}`, pngData);
          sfx.playSuccess();
        }
        URL.revokeObjectURL(url);
      };
      img.onerror = () => { sfx.playError(); setTokenError('Failed to load SVG'); URL.revokeObjectURL(url); };
      img.src = url;
    } catch {
      setTokenError('Failed to fetch token');
    } finally {
      setTokenLoading(false);
    }
  };

  // Composite image for AI + download
  const getCompositeImage = async (): Promise<string> => {
    const cvs = document.createElement('canvas');
    cvs.width = CANVAS_SIZE; cvs.height = CANVAS_SIZE;
    const ctx = cvs.getContext('2d');
    if (!ctx) throw new Error('Cannot create context');
    for (const layer of [...layers].reverse()) {
      if (layer.visible && layer.data) {
        const img = new Image();
        img.src = layer.data;
        await new Promise<void>(r => { img.onload = () => { ctx.globalAlpha = layer.opacity; ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE); r(); }; img.onerror = () => r(); });
      }
    }
    return cvs.toDataURL('image/png');
  };

  // AI generation
  const handleGenerate = async () => {
    if (!prompt.trim() || !apiKey.trim()) {
      setGenState({ isGenerating: false, error: !apiKey.trim() ? 'Enter your Gemini API key.' : null });
      return;
    }
    setGenState({ isGenerating: true, error: null });
    try {
      const composite = await getCompositeImage();
      const result = await generatePixelAsset(apiKey, prompt, composite);
      const img = new Image();
      img.src = result;
      await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); });
      const cvs = document.createElement('canvas');
      cvs.width = CANVAS_SIZE; cvs.height = CANVAS_SIZE;
      const ctx = cvs.getContext('2d');
      if (ctx) { ctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE); handleAddLayer(`AI: ${prompt}`, cvs.toDataURL('image/png')); }
      else handleAddLayer(`AI: ${prompt}`, result);
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
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const cvs = document.createElement('canvas');
        cvs.width = CANVAS_SIZE; cvs.height = CANVAS_SIZE;
        cvs.getContext('2d')?.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
        const data = cvs.toDataURL('image/png');
        const active = layers.find(l => l.id === activeLayerId);
        if (active && !active.data) handleUpdateLayer(activeLayerId, data);
        else handleAddLayer(file.name, data);
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
    const size = CANVAS_SIZE * downloadScale;
    const cvs = document.createElement('canvas');
    cvs.width = size; cvs.height = size;
    const ctx = cvs.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const img = new Image();
    img.onload = () => {
      ctx.drawImage(img, 0, 0, size, size);
      const link = document.createElement('a');
      link.download = `pixel-forge-${size}x${size}.png`;
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

              {/* Import BOOA */}
              <div className="border-2 border-neutral-700 dark:border-neutral-200 p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50" style={font}>Import BOOA</p>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={tokenIdInput}
                    onChange={e => setTokenIdInput(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={e => e.key === 'Enter' && handleImportToken()}
                    placeholder="Token ID"
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
                      onClick={() => { sfx.playClick(); setTool(type); if (type !== ToolType.SELECT) setSelection(null); }}
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

                {/* C64 Palette */}
                <p className="text-[9px] text-muted-foreground/50 mt-2" style={font}>C64 Palette</p>
                <div className="grid grid-cols-8 gap-0.5">
                  {C64_PALETTE.map((color, i) => (
                    <button
                      key={i}
                      onClick={() => { sfx.playClick(); setPrimaryColor(color); }}
                      className={`w-full aspect-square border ${primaryColor === color ? 'border-foreground ring-1 ring-foreground' : 'border-neutral-700 dark:border-neutral-600'}`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>

                {/* Custom color + transparent */}
                <p className="text-[9px] text-muted-foreground/50 mt-2" style={font}>Custom</p>
                <div className="flex gap-1 items-center">
                  <input
                    type="color"
                    value={primaryColor === 'transparent' ? '#ffffff' : primaryColor}
                    onChange={e => { sfx.playClick(); setPrimaryColor(e.target.value); }}
                    className="h-6 w-10 border border-neutral-700 dark:border-neutral-600 bg-background cursor-pointer"
                    title="Pick custom color"
                  />
                  <button
                    onClick={() => { sfx.playClick(); setPrimaryColor('transparent'); }}
                    className={`flex-1 h-6 border text-[9px] uppercase ${primaryColor === 'transparent' ? 'border-foreground ring-1 ring-foreground' : 'border-neutral-700 dark:border-neutral-600 hover:border-foreground/50'}`}
                    style={{
                      ...font,
                      backgroundImage: 'linear-gradient(45deg, #888 25%, transparent 25%), linear-gradient(-45deg, #888 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #888 75%), linear-gradient(-45deg, transparent 75%, #888 75%)',
                      backgroundSize: '6px 6px',
                      backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0px',
                    }}
                    title="Transparent (erase with pencil/fill)"
                  >
                    None
                  </button>
                </div>

                {/* Brush Size */}
                <div className="mt-2">
                  <div className="flex justify-between text-[9px] text-muted-foreground" style={font}>
                    <span>Brush</span><span>{brushSize}px</span>
                  </div>
                  <input type="range" min="1" max="10" value={brushSize} onChange={e => { const v = Number(e.target.value); setBrushSize(v); sfx.playSlider(v / 10); }} className="w-full" />
                </div>

                {/* Zoom */}
                <div>
                  <div className="flex justify-between text-[9px] text-muted-foreground" style={font}>
                    <span>Zoom</span><span>{zoom}x</span>
                  </div>
                  <input type="range" min="4" max="16" value={zoom} onChange={e => { const v = Number(e.target.value); setZoom(v); sfx.playSlider(v / 16); }} className="w-full" />
                </div>

                {/* BG Opacity */}
                <div>
                  <div className="flex justify-between text-[9px] text-muted-foreground" style={font}>
                    <span>BG Opacity</span><span>{Math.round(bgOpacity * 100)}%</span>
                  </div>
                  <input type="range" min="0" max="1" step="0.1" value={bgOpacity} onChange={e => { const v = Number(e.target.value); setBgOpacity(v); sfx.playSlider(v); }} className="w-full" />
                </div>
              </div>

              {/* Layers */}
              <div className="border-2 border-neutral-700 dark:border-neutral-200 p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50" style={font}>Layers ({layers.length})</p>
                  <button onClick={() => { sfx.playClick(); handleAddLayer(); }} className="text-muted-foreground hover:text-foreground"><Plus className="w-3 h-3" /></button>
                </div>
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
                        {layers.length > 1 && (
                          <button onClick={e => { e.stopPropagation(); sfx.playClick(); handleDeleteLayer(layer.id); }} className="text-muted-foreground/30 hover:text-red-500">
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
                      <option key={s} value={s}>{s}x ({CANVAS_SIZE * s}px)</option>
                    ))}
                  </select>
                  <button onClick={() => { sfx.playSuccess(); handleDownload(); }} className="flex-1 flex items-center justify-center gap-2 border-2 border-neutral-700 dark:border-neutral-200 p-1.5 text-[10px] uppercase hover:bg-foreground/5 transition-colors" style={font}>
                    <Download className="w-3 h-3" /> PNG
                  </button>
                </div>
              </div>
            </div>

            {/* Canvas */}
            <div className="flex-1 border-2 border-neutral-700 dark:border-neutral-200 bg-muted/20 overflow-hidden min-h-[400px] flex flex-col">
              <div className="border-b border-neutral-200 dark:border-neutral-700 px-3 py-1.5 flex justify-between items-center">
                <span className="text-[10px] text-muted-foreground/50" style={font}>{CANVAS_SIZE}x{CANVAS_SIZE} · C64 palette</span>
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
