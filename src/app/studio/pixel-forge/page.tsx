'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  Pencil, Eraser, Pipette, Download, BoxSelect,
  Wand2, Upload, Loader2, Undo, Trash2, Plus,
  PaintBucket, Eye, EyeOff, Hand, ArrowLeft, Grid3X3, Search,
  Minus, Circle, Square, ChevronUp, ChevronDown, Droplet, Replace, Copy, RotateCcw, RefreshCcw, Contrast,
  ExternalLink,
} from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { PixelEditor } from '@/components/features/studio/PixelEditor';
import { HolderGate } from '@/components/features/studio/HolderGate';
import { generatePixelAsset } from '@/lib/pixel-forge/gemini-service';
import { generateRetroDiffusion } from '@/lib/pixel-forge/replicate-service';
import { generateOpenAIImage } from '@/lib/pixel-forge/openai-service';
import { quantizeImageData, rgbToHex, snapToTopKPalette } from '@/lib/pixel-forge/quantize';
import { Layer, ToolType, DEFAULT_CANVAS_WIDTH, DEFAULT_CANVAS_HEIGHT, MAX_CANVAS_SIZE, MIN_CANVAS_SIZE, PALETTE_PRESETS, CANVAS_PRESETS, ASPECT_RATIOS, AI_MODELS, RD_STYLES, ANIMATION_PRESETS, FULL_SET_PRESET_ID, WORKSPACE_ORDER, getAnimationPreset, getRDCost, type GenerationState, type Rect } from '@/lib/pixel-forge/types';
import { sfx } from '@/lib/sounds';

const font = { fontFamily: 'var(--font-departure-mono)' };

const PIXEL_FORGE_STORAGE_PREFIX = 'pixel-forge:';

const PROVIDER_KEY_DOCS: Record<string, string> = {
  gemini: 'https://ai.google.dev/gemini-api/docs/api-key',
  openai: 'https://openrouter.ai/keys',
  replicate: 'https://replicate.com/account/api-tokens',
};

function readKey(provider: string): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(PIXEL_FORGE_STORAGE_PREFIX + provider + '-api-key') || '';
}

function writeKey(provider: string, value: string): void {
  if (typeof window === 'undefined') return;
  if (value) localStorage.setItem(PIXEL_FORGE_STORAGE_PREFIX + provider + '-api-key', value);
  else localStorage.removeItem(PIXEL_FORGE_STORAGE_PREFIX + provider + '-api-key');
}

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
  const [zoom, setZoom] = useState(1);
  const [contrast, setContrast] = useState(0);
  const [brightness, setBrightness] = useState(0);
  const [bgOpacity, setBgOpacity] = useState(0.5);
  const [showGrid, setShowGrid] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [genState, setGenState] = useState<GenerationState>({ isGenerating: false, error: null });
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [transparentBg, setTransparentBg] = useState(false);
  const [autoChromaKey, setAutoChromaKey] = useState(true);
  const [selectedModelId, setSelectedModelId] = useState(AI_MODELS[0].id);
  const [rdStyle, setRdStyle] = useState<string>('default');
  const selectedModel = AI_MODELS.find(m => m.id === selectedModelId) ?? AI_MODELS[0];

  useEffect(() => {
    setApiKey(readKey(selectedModel.provider));
  }, [selectedModel.provider]);

  function handleApiKeyChange(value: string) {
    const trimmed = value.trim();
    setApiKey(trimmed);
    writeKey(selectedModel.provider, trimmed);
  }
  const [spriteMode, setSpriteMode] = useState(false);
  const [spriteFps, setSpriteFps] = useState(8);
  const [spritePlaying, setSpritePlaying] = useState(false);
  const [spriteFrameIndex, setSpriteFrameIndex] = useState(0);
  // Animation Builder state (Phase 2)
  const [animationPresetId, setAnimationPresetId] = useState<string>('custom'); // 'custom' | one of ANIMATION_PRESETS ids | FULL_SET_PRESET_ID
  const [fullBody, setFullBody] = useState(false);
  // Workspaces — each animation state can have its own layer set so the
  // panel doesn't drown in 50+ layers when running a Full Set generation.
  // The "main" workspace is the default freeform canvas; other workspace
  // ids match ANIMATION_PRESETS ids.
  const [activeGroupId, setActiveGroupId] = useState<string>('main');
  const [groupCache, setGroupCache] = useState<Record<string, Layer[]>>({});
  // Per-call confirmation dialog
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    description: string;
    cost: string;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);
  // Full-body size picker dialog (asks 128 / 256 / cancel before enabling
  // Full Body when canvas is too small).
  // Size-picker dialog state was used to ask 128/256 when toggling Full
  // Body — removed: full body now respects the user's chosen canvas size.

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

  // Workspace navigation. Each animation state is its own workspace; users
  // jump between them with `<` / `>` (or arrow keys when no input is focused).
  // Switching saves the current layers to a per-group cache and loads the
  // target group's layers — keeping each state's edit history isolated.
  const switchToGroup = useCallback((targetId: string) => {
    if (targetId === activeGroupId) return;
    setGroupCache(prev => ({ ...prev, [activeGroupId]: layers }));
    const targetLayers = (groupCache[targetId] && groupCache[targetId].length > 0)
      ? groupCache[targetId]
      : [{ id: `base-${targetId}`, name: 'Base Layer', data: null, visible: true, opacity: 1, isLocked: false } as Layer];
    setLayers(targetLayers);
    setHistory([targetLayers]);
    setHistoryIndex(0);
    setActiveLayerId(targetLayers[0]?.id ?? '');
    setSpritePlaying(false);
    setSpriteFrameIndex(0);
    setSelection(null);
    setActiveGroupId(targetId);
  }, [activeGroupId, layers, groupCache]);

  // Only show in the switcher: groups that actually have content (layers with
  // any image data) plus the currently active group. Always include 'main'.
  const visibleGroupIds = (() => {
    const result = new Set<string>(['main', activeGroupId]);
    for (const id of Object.keys(groupCache)) {
      const ls = groupCache[id];
      if (ls && ls.some(l => l.data)) result.add(id);
    }
    if (layers.some(l => l.data)) result.add(activeGroupId);
    return WORKSPACE_ORDER.filter(id => result.has(id));
  })();

  const switchPrevGroup = useCallback(() => {
    const idx = visibleGroupIds.indexOf(activeGroupId);
    if (idx > 0) switchToGroup(visibleGroupIds[idx - 1]);
  }, [visibleGroupIds, activeGroupId, switchToGroup]);

  const switchNextGroup = useCallback(() => {
    const idx = visibleGroupIds.indexOf(activeGroupId);
    if (idx >= 0 && idx < visibleGroupIds.length - 1) switchToGroup(visibleGroupIds[idx + 1]);
  }, [visibleGroupIds, activeGroupId, switchToGroup]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') { e.preventDefault(); handleUndo(); }
      if (e.key === 'Escape') setSelection(null);
      // Workspace switcher shortcuts (only when no input is focused)
      const t = e.target as HTMLElement | null;
      const inField = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
      if (!inField && (e.key === 'ArrowLeft' || e.key === ',' || e.key === '<')) {
        e.preventDefault(); switchPrevGroup();
      }
      if (!inField && (e.key === 'ArrowRight' || e.key === '.' || e.key === '>')) {
        e.preventDefault(); switchNextGroup();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, switchPrevGroup, switchNextGroup]);

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

  const handleRevertLayer = () => {
    const layer = layers.find(l => l.id === activeLayerId);
    if (!layer) return;
    const orig = simplifySourceRef.current.get(activeLayerId) || originalLayerData.get(activeLayerId);
    if (!orig) return;
    pushToHistory(layers.map(l => l.id === activeLayerId ? { ...l, data: orig } : l));
    setOriginalLayerData(prev => { const next = new Map(prev); next.set(activeLayerId, orig); return next; });
    setSimplifyK(simplifyMax);
  };

  const applySimplify = useCallback(async (k: number) => {
    const layer = layers.find(l => l.id === activeLayerId);
    if (!layer?.data) return;

    let sourceData = simplifySourceRef.current.get(activeLayerId);
    if (!sourceData) sourceData = originalLayerData.get(activeLayerId);
    if (!sourceData) {
      sourceData = layer.data;
      simplifySourceRef.current.set(activeLayerId, sourceData);
    }

    if (k === 0) {
      pushToHistory(layers.map(l => l.id === activeLayerId ? { ...l, data: sourceData! } : l));
      return;
    }

    const img = new Image();
    img.src = sourceData;
    await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); });
    const cvs = document.createElement('canvas');
    cvs.width = img.naturalWidth || canvasWidth;
    cvs.height = img.naturalHeight || canvasHeight;
    const ctx = cvs.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, cvs.width, cvs.height);

    if (activePalette.colors.length > 0) {
      snapToTopKPalette(imgData, activePalette.colors, k);
      ctx.putImageData(imgData, 0, 0);
      pushToHistory(layers.map(l => l.id === activeLayerId ? { ...l, data: cvs.toDataURL('image/png') } : l));
    } else {
      const centroids = quantizeImageData(imgData, k);
      if (centroids.length === 0) return;
      ctx.putImageData(imgData, 0, 0);
      pushToHistory(layers.map(l => l.id === activeLayerId ? { ...l, data: cvs.toDataURL('image/png') } : l));
      setCustomColors(centroids.map(rgbToHex));
      setActivePalette({ name: '__custom__', colors: [] });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLayerId, layers, originalLayerData, canvasWidth, canvasHeight, activePalette]);

  const handleSimplifyChange = (k: number) => {
    setSimplifyK(k);
    if (simplifyTimerRef.current) clearTimeout(simplifyTimerRef.current);
    simplifyTimerRef.current = setTimeout(() => applySimplify(k), 200);
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

  const handleInvertLayer = () => {
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
      const inSel = (x: number, y: number) => !selection || (x >= selection.x && x < selection.x + selection.w && y >= selection.y && y < selection.y + selection.h);
      for (let y = 0; y < canvasHeight; y++) {
        for (let x = 0; x < canvasWidth; x++) {
          if (!inSel(x, y)) continue;
          const i = (y * canvasWidth + x) * 4;
          if (d[i + 3] < 128) continue;
          d[i] = 255 - d[i];
          d[i + 1] = 255 - d[i + 1];
          d[i + 2] = 255 - d[i + 2];
        }
      }
      ctx.putImageData(imageData, 0, 0);
      handleUpdateLayer(activeLayerId, cvs.toDataURL('image/png'));
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

  // Regenerate a single frame (layer) in place using the same prompt + canonical
  // reference. Used in sprite mode when one frame goes off-model and the rest
  // are good — saves a full re-roll of all 16 frames.
  const handleRegenerateFrame = async (layerId: string) => {
    const layer = layers.find(l => l.id === layerId);
    if (!layer) return;
    if (!prompt.trim() || !apiKey.trim()) {
      setGenState({
        isGenerating: false,
        error: !apiKey.trim() ? `Enter your ${selectedModel.keyLabel}.` : 'Need a prompt to regenerate this frame.',
      });
      return;
    }
    const callCost = selectedModel.provider === 'replicate'
      ? getRDCost(rdStyle, canvasWidth, canvasHeight)
      : selectedModel.costPerImage;
    const costStr = `~$${callCost.toFixed(3)} per call (${selectedModel.label}, your key)`;

    const ok = await confirmCall(
      `Regenerate "${layer.name}"`,
      `AI will produce a single ${canvasWidth}x${canvasHeight} replacement for this frame using your prompt and the canonical reference (full-body layer or first frame). Other frames remain untouched.`,
      costStr,
    );
    if (!ok) return;

    setGenState({ isGenerating: true, error: null });
    try {
      // Use full-body layer if present, otherwise the first non-empty layer
      // as the canonical identity reference.
      const fbLayer = layers.find(l => l.name.startsWith('Full Body') && l.data);
      const fallback = layers.find(l => l.id !== layerId && l.data) ?? layer;
      const refImg = fbLayer?.data ?? fallback.data ?? undefined;
      const preset = animationPresetId === 'custom' ? null : getAnimationPreset(animationPresetId);
      const bg = transparentBg ? 'BRIGHT GREEN (#00FF00) chroma-key' : 'fitting';
      const finalPrompt = preset
        ? `${prompt}. Same character as the reference image. Do NOT change the character appearance, palette, or art style — only the pose changes. Pose: ${preset.pose}. Single ${canvasWidth}x${canvasHeight} pixel-art frame, hard pixel edges, no anti-aliasing, flat ${bg} background.`
        : `${prompt}. Same character as the reference image. Do NOT change the character appearance, palette, or art style — only the pose changes. Single ${canvasWidth}x${canvasHeight} pixel-art frame, hard pixel edges, no anti-aliasing, flat ${bg} background.`;

      const result = await runGeneration({
        prompt: finalPrompt,
        width: canvasWidth,
        height: canvasHeight,
        inputImage: refImg,
        selection: null,
        hasExistingArt: !!refImg,
        spriteMode: false,
      });

      const img = new Image();
      img.src = result;
      await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); });
      const cvs = document.createElement('canvas');
      cvs.width = canvasWidth; cvs.height = canvasHeight;
      const ctx = cvs.getContext('2d', { willReadFrequently: true });
      if (!ctx) { setGenState({ isGenerating: false, error: null }); return; }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
      if (transparentBg && autoChromaKey) {
        const data = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
        const d = data.data;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          if (r <= 100 && g >= 150 && b <= 100 && g > (r + b) * 1.3) d[i + 3] = 0;
        }
        ctx.putImageData(data, 0, 0);
      }

      const newData = cvs.toDataURL('image/png');
      const next = layers.map(l => l.id === layerId ? { ...l, data: newData } : l);
      pushToHistory(next);
      setGenState({ isGenerating: false, error: null });
      sfx.playSuccess();
    } catch (err) {
      setGenState({
        isGenerating: false,
        error: err instanceof Error ? err.message : 'Regeneration failed.',
      });
    }
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

  const quantizeToPalette = (ctx: CanvasRenderingContext2D, w: number, h: number, c = 0, b = 0, paletteHexes: string[] = allColors) => {
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
    const palette = paletteHexes.map(hex => [
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
  const simplifyMax = activePalette.colors.length > 0 ? activePalette.colors.length : 48;
  const [simplifyK, setSimplifyK] = useState(simplifyMax);
  const simplifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const simplifySourceRef = useRef<Map<string, string>>(new Map());

  useEffect(() => { setSimplifyK(simplifyMax); }, [activeLayerId, simplifyMax]);

  useEffect(() => {
    setZoom(1);
  }, [canvasWidth, canvasHeight]);

  useEffect(() => {
    if (!spriteMode || !spritePlaying || layers.length < 2) return;
    const interval = setInterval(() => {
      setSpriteFrameIndex(i => (i + 1) % layers.length);
    }, Math.max(1, Math.round(1000 / spriteFps)));
    return () => clearInterval(interval);
  }, [spriteMode, spritePlaying, spriteFps, layers.length]);

  useEffect(() => {
    if (!spriteMode) {
      setSpritePlaying(false);
      setSpriteFrameIndex(0);
    }
  }, [spriteMode]);

  useEffect(() => {
    if (spriteMode && spriteFrameIndex >= layers.length) {
      setSpriteFrameIndex(0);
    }
  }, [layers.length, spriteMode, spriteFrameIndex]);

  // In sprite mode, when playback is paused, keep `activeLayerId` aligned with
  // the visible frame so editing affects the layer the user is looking at.
  useEffect(() => {
    if (!spriteMode || spritePlaying) return;
    const visible = layers[spriteFrameIndex];
    if (visible && visible.id !== activeLayerId) {
      setActiveLayerId(visible.id);
    }
  }, [spriteMode, spritePlaying, spriteFrameIndex, layers, activeLayerId]);

  const renderLayerAtScale = async (layerData: string, scale: number): Promise<Blob | null> => {
    const img = new Image();
    img.src = layerData;
    await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); });
    const w = canvasWidth * scale;
    const h = canvasHeight * scale;
    const cvs = document.createElement('canvas');
    cvs.width = w; cvs.height = h;
    const ctx = cvs.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob | null>(resolve => cvs.toBlob(resolve, 'image/png'));
  };

  const getLayerImageDataAtScale = async (layerData: string, scale: number): Promise<ImageData | null> => {
    const img = new Image();
    img.src = layerData;
    await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); });
    const w = canvasWidth * scale;
    const h = canvasHeight * scale;
    const cvs = document.createElement('canvas');
    cvs.width = w; cvs.height = h;
    const ctx = cvs.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  };

  const handleExportFramesZip = async () => {
    if (layers.length === 0) return;
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    for (let i = 0; i < layers.length; i++) {
      const l = layers[i];
      if (!l.data) continue;
      const blob = await renderLayerAtScale(l.data, downloadScale);
      if (!blob) continue;
      const idx = String(i + 1).padStart(2, '0');
      zip.file(`frame-${idx}.png`, blob);
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const sizeW = canvasWidth * downloadScale;
    const sizeH = canvasHeight * downloadScale;
    const link = document.createElement('a');
    link.href = url;
    link.download = `pixel-forge-frames-${sizeW}x${sizeH}.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExportGif = async () => {
    if (layers.length < 2) return;
    const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
    const w = canvasWidth * downloadScale;
    const h = canvasHeight * downloadScale;
    const delay = Math.max(20, Math.round(1000 / spriteFps));
    const gif = GIFEncoder();
    for (let i = 0; i < layers.length; i++) {
      const l = layers[i];
      if (!l.data) continue;
      const imgData = await getLayerImageDataAtScale(l.data, downloadScale);
      if (!imgData) continue;
      let hasTransparent = false;
      for (let p = 3; p < imgData.data.length; p += 4) {
        if (imgData.data[p] < 128) { hasTransparent = true; break; }
      }
      const fmt = hasTransparent ? 'rgba4444' : 'rgb444';
      const palette = quantize(imgData.data, 256, { format: fmt });
      const indexed = applyPalette(imgData.data, palette, fmt);
      const opts: { palette: number[][]; delay: number; transparent?: boolean } = { palette, delay };
      if (hasTransparent) opts.transparent = true;
      gif.writeFrame(indexed, w, h, opts);
    }
    gif.finish();
    const bytes = gif.bytes();
    const blob = new Blob([new Uint8Array(bytes)], { type: 'image/gif' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pixel-forge-animation-${w}x${h}-${spriteFps}fps.gif`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Compose every layer into a single horizontally-tiled atlas image at the
  // requested scale. Used by both the WebP and Aseprite exports.
  const composeAtlasCanvas = async (cols: number = 8): Promise<{ canvas: HTMLCanvasElement; cols: number; rows: number; cellW: number; cellH: number } | null> => {
    if (layers.length === 0) return null;
    const validLayers = layers.filter(l => l.data);
    if (validLayers.length === 0) return null;
    const cellW = canvasWidth * downloadScale;
    const cellH = canvasHeight * downloadScale;
    const useCols = Math.min(cols, validLayers.length);
    const useRows = Math.ceil(validLayers.length / useCols);
    const cvs = document.createElement('canvas');
    cvs.width = useCols * cellW;
    cvs.height = useRows * cellH;
    const ctx = cvs.getContext('2d');
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    for (let i = 0; i < validLayers.length; i++) {
      const l = validLayers[i];
      const img = new Image();
      img.src = l.data!;
      await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); });
      const col = i % useCols;
      const row = Math.floor(i / useCols);
      ctx.drawImage(img, col * cellW, row * cellH, cellW, cellH);
    }
    return { canvas: cvs, cols: useCols, rows: useRows, cellW, cellH };
  };

  const handleExportWebpAtlas = async () => {
    const atlas = await composeAtlasCanvas(8);
    if (!atlas) return;
    const blob = await new Promise<Blob | null>(r => atlas.canvas.toBlob(r, 'image/webp', 0.95));
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pixel-forge-atlas-${atlas.cols}x${atlas.rows}-${atlas.cellW}x${atlas.cellH}.webp`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Aseprite Hash JSON sidecar export: zips a PNG spritesheet + .json that
  // Aseprite can open via "File > Import Sprite Sheet".
  const handleExportAsepriteBundle = async () => {
    const atlas = await composeAtlasCanvas(8);
    if (!atlas) return;
    const pngBlob = await new Promise<Blob | null>(r => atlas.canvas.toBlob(r, 'image/png'));
    if (!pngBlob) return;
    const validLayers = layers.filter(l => l.data);
    const duration = Math.max(20, Math.round(1000 / spriteFps));
    const frames: Record<string, { frame: { x: number; y: number; w: number; h: number }; rotated: boolean; trimmed: boolean; spriteSourceSize: { x: number; y: number; w: number; h: number }; sourceSize: { w: number; h: number }; duration: number }> = {};
    validLayers.forEach((l, i) => {
      const col = i % atlas.cols;
      const row = Math.floor(i / atlas.cols);
      const key = `${l.name.replace(/\s+/g, '_')}_${i}.png`;
      frames[key] = {
        frame: { x: col * atlas.cellW, y: row * atlas.cellH, w: atlas.cellW, h: atlas.cellH },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: atlas.cellW, h: atlas.cellH },
        sourceSize: { w: atlas.cellW, h: atlas.cellH },
        duration,
      };
    });
    const spec = {
      frames,
      meta: {
        app: 'https://booa.app/studio/pixel-forge',
        version: '1.0',
        format: 'RGBA8888',
        size: { w: atlas.canvas.width, h: atlas.canvas.height },
        scale: String(downloadScale),
        image: 'spritesheet.png',
        frameTags: [{ name: 'animation', from: 0, to: validLayers.length - 1, direction: 'forward' }],
      },
    };
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    zip.file('spritesheet.png', pngBlob);
    zip.file('spritesheet.json', JSON.stringify(spec, null, 2));
    const bundle = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(bundle);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pixel-forge-aseprite-${atlas.cellW}x${atlas.cellH}.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Codex pet contract: 1536x1872 atlas, 8 cols x 9 rows, 192x208 per cell.
  // Each row is a specific animation state with a fixed frame count.
  // We place the user's frames into the row that matches their selected
  // preset (or `idle` for Custom). Other rows remain fully transparent.
  // Output: a zip with pet.json + spritesheet.webp ready to drop into
  // `${CODEX_HOME:-$HOME/.codex}/pets/<id>/`.
  const handleExportCodexPet = async () => {
    // Codex row order (matches references/animation-rows.md in booa-pet skill).
    const CODEX_ROWS = [
      { id: 'idle',          frames: 6 },
      { id: 'running-right', frames: 8 },
      { id: 'running-left',  frames: 8 },
      { id: 'waving',        frames: 4 },
      { id: 'jumping',       frames: 5 },
      { id: 'failed',        frames: 8 },
      { id: 'waiting',       frames: 6 },
      { id: 'running',       frames: 6 },
      { id: 'review',        frames: 6 },
    ];
    const CELL_W = 192;
    const CELL_H = 208;
    const COLS = 8;
    const ROWS = 9;

    // Snapshot all workspaces (active in `layers`, others in groupCache).
    const allGroups: Record<string, Layer[]> = { ...groupCache, [activeGroupId]: layers };
    const stateGroupsWithContent = CODEX_ROWS
      .map(r => ({ row: r, layers: (allGroups[r.id] ?? []).filter(l => l.data) }))
      .filter(g => g.layers.length > 0);

    // Plan which frames go in which row:
    // - If any per-state workspaces have content → multi-state export
    // - Otherwise → place the active workspace's frames into the row matching
    //   animationPresetId (or `idle` for Custom)
    type Plan = { rowIdx: number; layers: Layer[]; max: number };
    const plans: Plan[] = [];
    if (stateGroupsWithContent.length > 0) {
      for (const g of stateGroupsWithContent) {
        const rowIdx = CODEX_ROWS.findIndex(r => r.id === g.row.id);
        if (rowIdx >= 0) plans.push({ rowIdx, layers: g.layers, max: g.row.frames });
      }
    } else {
      const validLayers = layers.filter(l => l.data);
      if (validLayers.length === 0) return;
      const fallbackRowId = animationPresetId === 'custom' || animationPresetId === FULL_SET_PRESET_ID ? 'idle' : animationPresetId;
      const rowIdx = CODEX_ROWS.findIndex(r => r.id === fallbackRowId);
      if (rowIdx < 0) return;
      plans.push({ rowIdx, layers: validLayers, max: CODEX_ROWS[rowIdx].frames });
    }

    const atlas = document.createElement('canvas');
    atlas.width = COLS * CELL_W;   // 1536
    atlas.height = ROWS * CELL_H;  // 1872
    const ctx = atlas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    // We may have layers with different intrinsic sizes across workspaces.
    // Probe each layer's natural dimensions when scaling into the cell.
    for (const plan of plans) {
      const framesToPlace = plan.layers.slice(0, plan.max);
      for (let i = 0; i < framesToPlace.length; i++) {
        const layer = framesToPlace[i];
        if (!layer.data) continue;
        const img = new Image();
        img.src = layer.data;
        await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); });
        const srcW = img.naturalWidth || canvasWidth;
        const srcH = img.naturalHeight || canvasHeight;
        const srcAR = srcW / srcH;
        const cellAR = CELL_W / CELL_H;
        let drawW: number, drawH: number;
        if (srcAR > cellAR) { drawW = CELL_W; drawH = Math.round(CELL_W / srcAR); }
        else { drawH = CELL_H; drawW = Math.round(CELL_H * srcAR); }
        const dx = i * CELL_W + Math.floor((CELL_W - drawW) / 2);
        const dy = plan.rowIdx * CELL_H + Math.floor((CELL_H - drawH) / 2);
        ctx.drawImage(img, dx, dy, drawW, drawH);
      }
    }

    const webpBlob = await new Promise<Blob | null>(r => atlas.toBlob(r, 'image/webp', 0.95));
    if (!webpBlob) return;

    const tokenId = tokenIdInput || '';
    const slug = tokenId ? `booa-${tokenId}` : `pixel-forge-pet-${Date.now()}`;
    const displayName = tokenId ? `BOOA #${tokenId}` : `Pixel Forge Pet`;
    const stateLabels = plans.map(p => CODEX_ROWS[p.rowIdx].id).join(', ');
    const description = stateLabels
      ? `Codex pet generated in Pixel Forge with states: ${stateLabels}.`
      : 'Codex pet generated in Pixel Forge.';

    const petJson = {
      id: slug,
      displayName,
      description,
      spritesheetPath: 'spritesheet.webp',
    };

    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    zip.file(`${slug}/spritesheet.webp`, webpBlob);
    zip.file(`${slug}/pet.json`, JSON.stringify(petJson, null, 2));
    const bundle = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(bundle);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${slug}-codex-pet.zip`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleExportMp4 = async () => {
    if (layers.length < 2) return;
    if (typeof VideoEncoder === 'undefined') {
      setGenState({ isGenerating: false, error: 'MP4 export requires WebCodecs (Chrome, Edge, recent Safari).' });
      return;
    }
    const { Muxer, ArrayBufferTarget } = await import('mp4-muxer');
    const w = canvasWidth * downloadScale;
    const h = canvasHeight * downloadScale;
    // mp4-muxer requires even dimensions.
    const evenW = w + (w % 2);
    const evenH = h + (h % 2);
    const fps = Math.max(1, spriteFps);
    const frameDurUs = Math.round(1_000_000 / fps);
    const target = new ArrayBufferTarget();
    const muxer = new Muxer({
      target,
      video: { codec: 'avc', width: evenW, height: evenH, frameRate: fps },
      fastStart: 'in-memory',
    });
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: e => { console.error(e); },
    });
    encoder.configure({
      codec: 'avc1.42E01F',
      width: evenW,
      height: evenH,
      bitrate: 1_500_000,
      framerate: fps,
    });
    let timestamp = 0;
    for (let i = 0; i < layers.length; i++) {
      const l = layers[i];
      if (!l.data) continue;
      const img = new Image();
      img.src = l.data;
      await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); });
      const cvs = document.createElement('canvas');
      cvs.width = evenW;
      cvs.height = evenH;
      const ctx = cvs.getContext('2d');
      if (!ctx) continue;
      ctx.imageSmoothingEnabled = false;
      // black bg helps codecs; transparent video is not supported by AVC
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, evenW, evenH);
      ctx.drawImage(img, 0, 0, w, h);
      const frame = new VideoFrame(cvs, { timestamp });
      encoder.encode(frame, { keyFrame: i === 0 });
      frame.close();
      timestamp += frameDurUs;
    }
    await encoder.flush();
    encoder.close();
    muxer.finalize();
    const blob = new Blob([target.buffer as ArrayBuffer], { type: 'video/mp4' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pixel-forge-animation-${w}x${h}-${fps}fps.mp4`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
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

    const colors = activePalette.name === '__custom__'
      ? customColors.filter(c => c)
      : activePalette.colors;

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
            quantizeToPalette(ctx, w, h, contrast, brightness, colors);
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
  // Show a confirmation dialog and wait for the user's choice. Returns true on confirm.
  const confirmCall = (title: string, description: string, cost: string): Promise<boolean> => {
    return new Promise(resolve => {
      setConfirmDialog({
        title,
        description,
        cost,
        onConfirm: () => { setConfirmDialog(null); resolve(true); },
        onCancel: () => { setConfirmDialog(null); resolve(false); },
      });
    });
  };

  // Run a single AI generation call against the currently selected provider.
  // Used both by the main sprite/single-image flow and by the full-body
  // extension step.
  const runGeneration = async (params: {
    prompt: string;
    width: number;
    height: number;
    inputImage: string | undefined;
    layoutGuide?: string;
    selection: Rect | null;
    hasExistingArt: boolean;
    spriteMode: boolean;
  }): Promise<string> => {
    if (selectedModel.provider === 'replicate') {
      // Replicate Retro Diffusion is single-input — layout guide is dropped.
      return await generateRetroDiffusion({
        replicateToken: apiKey,
        prompt: params.prompt,
        width: params.width,
        height: params.height,
        style: params.spriteMode ? 'item_sheet' : rdStyle,
        transparentBg,
        inputImage: params.inputImage,
        strength: params.spriteMode ? 0.5 : 0.7,
        bypassPromptExpansion: params.spriteMode,
      });
    }
    if (selectedModel.provider === 'openai') {
      return await generateOpenAIImage(
        apiKey,
        params.prompt,
        params.width,
        params.height,
        [],
        params.inputImage,
        params.selection,
        params.hasExistingArt,
        transparentBg,
        selectedModelId,
        params.spriteMode,
        params.layoutGuide,
      );
    }
    return await generatePixelAsset(
      apiKey,
      params.prompt,
      params.width,
      params.height,
      [],
      params.inputImage,
      params.selection,
      params.hasExistingArt,
      transparentBg,
      selectedModelId,
      params.spriteMode,
      params.layoutGuide,
    );
  };

  // Build a layout guide image: a 4x4 grid of cells matching the current
  // canvas size, with the FIRST `frameCount` cells highlighted (active) and
  // the rest visibly inactive (X mark). Numbered. Sent as a SECOND reference
  // image so the AI knows exactly which cells must contain animation frames
  // and where the cell boundaries are. This is the same pattern the upstream
  // hatch-pet skill uses to keep frame counts consistent.
  const buildLayoutGuide = (cellW: number, cellH: number, frameCount: number): string => {
    const cols = 4;
    const rows = 4;
    const w = cellW * cols;
    const h = cellH * rows;
    const cvs = document.createElement('canvas');
    cvs.width = w;
    cvs.height = h;
    const ctx = cvs.getContext('2d');
    if (!ctx) return '';
    // Background — light flat gray
    ctx.fillStyle = '#f7f7f7';
    ctx.fillRect(0, 0, w, h);
    const total = cols * rows;
    const marginX = Math.max(2, Math.floor(cellW * 0.08));
    const marginY = Math.max(2, Math.floor(cellH * 0.08));
    for (let i = 0; i < total; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * cellW;
      const y = row * cellH;
      const isActive = i < frameCount;
      // Hard cell outline
      ctx.strokeStyle = '#111111';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + 1, y + 1, cellW - 2, cellH - 2);
      // Inner safe-area: blue when active, gray when inactive
      ctx.strokeStyle = isActive ? '#2f80ed' : '#cccccc';
      ctx.lineWidth = 2;
      ctx.strokeRect(x + marginX, y + marginY, cellW - 2 * marginX, cellH - 2 * marginY);
      if (isActive) {
        // Dashed crosshair through the safe-area center
        ctx.strokeStyle = '#b8b8b8';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1;
        const cx = x + cellW / 2;
        const cy = y + cellH / 2;
        ctx.beginPath();
        ctx.moveTo(cx, y + marginY);
        ctx.lineTo(cx, y + cellH - marginY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + marginX, cy);
        ctx.lineTo(x + cellW - marginX, cy);
        ctx.stroke();
        ctx.setLineDash([]);
        // Frame number, top-left corner
        const fontSize = Math.max(8, Math.floor(cellH * 0.16));
        ctx.fillStyle = '#444444';
        ctx.font = `${fontSize}px monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(String(i + 1), x + marginX + 2, y + marginY + 2);
      } else {
        // Big X through inactive cell
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + marginX, y + marginY);
        ctx.lineTo(x + cellW - marginX, y + cellH - marginY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x + cellW - marginX, y + marginY);
        ctx.lineTo(x + marginX, y + cellH - marginY);
        ctx.stroke();
      }
    }
    return cvs.toDataURL('image/png');
  };

  // Slice a generated sprite sheet image into a 4×4 grid of cells at the
  // current canvas size, then return only the FIRST `frameCount` cells
  // (default 16). This matches the layout guide we send to the AI: cells
  // 1..frameCount are filled with animation frames, the rest are inactive.
  const sliceSheetIntoFrames = async (
    img: HTMLImageElement,
    refComposite: string | undefined,
    namePrefix: string,
    frameCount: number = 16,
  ): Promise<Layer[]> => {
    const cellW = canvasWidth;
    const cellH = canvasHeight;
    const sheetW = cellW * 4;
    const sheetH = cellH * 4;

    let referencePalette: string[] = [];
    if (refComposite) {
      const refImg = new Image();
      refImg.src = refComposite;
      await new Promise<void>(r => { refImg.onload = () => r(); refImg.onerror = () => r(); });
      const refCvs = document.createElement('canvas');
      refCvs.width = cellW; refCvs.height = cellH;
      const refCtx = refCvs.getContext('2d', { willReadFrequently: true });
      if (refCtx) {
        refCtx.drawImage(refImg, 0, 0);
        const refData = refCtx.getImageData(0, 0, cellW, cellH);
        const centroids = quantizeImageData(refData, 16);
        referencePalette = centroids.map(rgbToHex);
      }
    }
    const sheet = document.createElement('canvas');
    sheet.width = sheetW; sheet.height = sheetH;
    const sctx = sheet.getContext('2d', { willReadFrequently: true });
    if (!sctx) return [];
    sctx.imageSmoothingEnabled = false; // nearest-neighbor when API output differs in size
    sctx.drawImage(img, 0, 0, sheetW, sheetH);
    const out: Layer[] = [];
    const cap = Math.max(1, Math.min(16, frameCount));
    for (let i = 0; i < cap; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const fcvs = document.createElement('canvas');
      fcvs.width = cellW; fcvs.height = cellH;
      const fctx = fcvs.getContext('2d', { willReadFrequently: true });
      if (!fctx) continue;
      fctx.imageSmoothingEnabled = false;
      fctx.drawImage(sheet, col * cellW, row * cellH, cellW, cellH, 0, 0, cellW, cellH);
      const frameData = fctx.getImageData(0, 0, cellW, cellH);
      if (transparentBg && autoChromaKey) {
        const d = frameData.data;
        for (let j = 0; j < d.length; j += 4) {
          const r = d[j], g = d[j + 1], b = d[j + 2];
          if (r <= 100 && g >= 150 && b <= 100 && g > (r + b) * 1.3) d[j + 3] = 0;
        }
      }
      // Drop tiny disconnected blobs (artifacts, stray pixels left by AI
      // outside the main character silhouette). Keeps largest connected
      // alpha component plus anything ≥ 5% of its area.
      cleanupDisconnectedBlobs(frameData, 0.05);
      if (referencePalette.length > 0) {
        snapToTopKPalette(frameData, referencePalette, referencePalette.length);
      }
      fctx.putImageData(frameData, 0, 0);
      // Fit-to-cell post-processing: find the main character bbox, scale it
      // down (never up) to fit a small inner margin, recenter horizontally
      // and vertically. Mirrors what extract_strip_frames.py does in the
      // upstream hatch-pet skill so the AI's per-cell positioning errors
      // get corrected before we save the layer.
      const fittedCanvas = fitFrameToCell(fcvs, cellW, cellH);
      const n = i + 1;
      out.push({
        id: `${namePrefix}-${Date.now()}-${n}-${Math.random().toString(36).slice(2, 6)}`,
        name: `${namePrefix} ${String(n).padStart(2, '0')}`,
        data: fittedCanvas.toDataURL('image/png'),
        visible: true,
        opacity: 1,
        isLocked: false,
      });
    }
    return out;
  };

  // Find the bounding box of non-transparent pixels in a canvas, then
  // crop, scale to fit within a small margin, and recenter. Returns a
  // NEW canvas of the same (cellW, cellH) size with the recentered art.
  // If the cell is empty, returns the original canvas unchanged.
  const fitFrameToCell = (source: HTMLCanvasElement, cellW: number, cellH: number): HTMLCanvasElement => {
    const ctx = source.getContext('2d', { willReadFrequently: true });
    if (!ctx) return source;
    const data = ctx.getImageData(0, 0, cellW, cellH);
    const buf = data.data;
    let minX = cellW, minY = cellH, maxX = -1, maxY = -1;
    for (let y = 0; y < cellH; y++) {
      for (let x = 0; x < cellW; x++) {
        const a = buf[(y * cellW + x) * 4 + 3];
        if (a > 16) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0) return source; // empty cell
    const srcW = maxX - minX + 1;
    const srcH = maxY - minY + 1;
    // 5% pixel margin floor of 2px on each side
    const margin = Math.max(2, Math.floor(Math.min(cellW, cellH) * 0.04));
    const targetMaxW = cellW - margin * 2;
    const targetMaxH = cellH - margin * 2;
    const scale = Math.min(targetMaxW / srcW, targetMaxH / srcH, 1.0);
    const newW = Math.max(1, Math.round(srcW * scale));
    const newH = Math.max(1, Math.round(srcH * scale));
    const dx = Math.floor((cellW - newW) / 2);
    const dy = Math.floor((cellH - newH) / 2);
    // Already perfectly fit and centered? skip work.
    if (scale === 1.0 && minX === dx && minY === dy) return source;
    const out = document.createElement('canvas');
    out.width = cellW;
    out.height = cellH;
    const outCtx = out.getContext('2d');
    if (!outCtx) return source;
    outCtx.imageSmoothingEnabled = false;
    outCtx.drawImage(source, minX, minY, srcW, srcH, dx, dy, newW, newH);
    return out;
  };

  // Connected-components flood fill on alpha channel. Drops any blob whose
  // area is < `minRatio` × the largest blob's area. Mutates the ImageData.
  // Used to clean up stray pixels outside the main character silhouette.
  const cleanupDisconnectedBlobs = (data: ImageData, minRatio: number = 0.05): void => {
    const w = data.width;
    const h = data.height;
    const buf = data.data;
    const visited = new Uint8Array(w * h);
    const blobs: { pixels: number[]; area: number }[] = [];
    for (let i = 0; i < w * h; i++) {
      if (visited[i]) continue;
      const a = buf[i * 4 + 3];
      if (a <= 16) { visited[i] = 1; continue; }
      const stack = [i];
      const pixels: number[] = [];
      while (stack.length > 0) {
        const cur = stack.pop()!;
        if (visited[cur]) continue;
        visited[cur] = 1;
        if (buf[cur * 4 + 3] <= 16) continue;
        pixels.push(cur);
        const x = cur % w;
        const y = Math.floor(cur / w);
        if (x > 0) { const n = cur - 1; if (!visited[n]) stack.push(n); }
        if (x + 1 < w) { const n = cur + 1; if (!visited[n]) stack.push(n); }
        if (y > 0) { const n = cur - w; if (!visited[n]) stack.push(n); }
        if (y + 1 < h) { const n = cur + w; if (!visited[n]) stack.push(n); }
      }
      if (pixels.length > 0) blobs.push({ pixels, area: pixels.length });
    }
    if (blobs.length <= 1) return;
    const maxArea = Math.max(...blobs.map(b => b.area));
    const threshold = maxArea * minRatio;
    for (const blob of blobs) {
      if (blob.area >= threshold) continue;
      // erase this blob — set alpha to 0
      for (const p of blob.pixels) buf[p * 4 + 3] = 0;
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim() || !apiKey.trim()) {
      setGenState({ isGenerating: false, error: !apiKey.trim() ? `Enter your ${selectedModel.keyLabel}.` : null });
      return;
    }

    const preset = animationPresetId === 'custom' ? null : getAnimationPreset(animationPresetId);
    const callCost = selectedModel.provider === 'replicate'
      ? getRDCost(rdStyle, spriteMode ? canvasWidth * 4 : canvasWidth, spriteMode ? canvasHeight * 4 : canvasHeight)
      : selectedModel.costPerImage;
    const costStr = `~$${callCost.toFixed(3)} per call (${selectedModel.label}, your key)`;

    // Full Set — Codex BOOA: generate all 9 animation states in sequence,
    // each into its own workspace. Reference image stays fixed (the main
    // workspace composite, optionally extended to full body first).
    if (animationPresetId === FULL_SET_PRESET_ID) {
      if (!spriteMode) {
        setGenState({ isGenerating: false, error: 'Enable Animation mode to use Full Set.' });
        return;
      }
      const totalCalls = ANIMATION_PRESETS.length + (fullBody ? 1 : 0);
      const totalCost = callCost * totalCalls;
      const okBatch = await confirmCall(
        'Full Set — Codex BOOA',
        `${totalCalls} calls total: ${fullBody ? 'one full-body extension + ' : ''}one per animation state (${ANIMATION_PRESETS.map(p => p.label).join(', ')}). Each state lands in its own workspace; switch with ← / →.`,
        `~$${totalCost.toFixed(3)} estimated total`,
      );
      if (!okBatch) return;

      setGenState({ isGenerating: true, error: null });
      try {
        const composite = await getCompositeImage();
        const hasExistingArt = layers.some(l => l.visible && l.data);
        if (!hasExistingArt) {
          setGenState({ isGenerating: false, error: 'Full Set needs a base character on the main workspace. Import a token or draw something first.' });
          return;
        }

        // Optional full-body extension on the main workspace.
        // We track the post-extension main layers locally so the cache
        // snapshot at the end captures the new Full Body layer too.
        let baseImage = composite;
        let mainLayersAfter: Layer[] = layers;
        if (fullBody) {
          // Extension call MUST be neutral. We deliberately omit the user's
          // free-text prompt and any preset pose so the AI cannot bias the
          // canonical reference toward an animation (e.g. selecting Jumping
          // would otherwise produce a mid-jump full-body — which then
          // poisons every subsequent row).
          const extPrompt = `Take the attached reference image and extend it into a complete full-body character sprite in a NEUTRAL STANDING POSE. Keep every existing pixel of the head and shoulders unchanged. Add the rest of the body, arms (relaxed at sides), hands, legs (standing flat together), and feet in the exact same pixel-art style, palette, and outline weight as the reference. Do NOT change the character appearance, do NOT change the art style, do NOT redesign anything. Do NOT animate, do NOT add pose, motion, expression change, action, or scenery. Output a single centered, idle, full-body sprite on a flat ${transparentBg ? 'BRIGHT GREEN (#00FF00) chroma-key' : 'fitting'} background.`;
          const extResult = await runGeneration({
            prompt: extPrompt,
            width: canvasWidth,
            height: canvasHeight,
            inputImage: composite,
            selection: null,
            hasExistingArt: true,
            spriteMode: false,
          });
          const extImg = new Image();
          extImg.src = extResult;
          await new Promise<void>(r => { extImg.onload = () => r(); extImg.onerror = () => r(); });
          const extCvs = document.createElement('canvas');
          extCvs.width = canvasWidth; extCvs.height = canvasHeight;
          const extCtx = extCvs.getContext('2d', { willReadFrequently: true });
          if (extCtx) {
            extCtx.drawImage(extImg, 0, 0, canvasWidth, canvasHeight);
            if (transparentBg && autoChromaKey) {
              const data = extCtx.getImageData(0, 0, canvasWidth, canvasHeight);
              const d = data.data;
              for (let i = 0; i < d.length; i += 4) {
                const r = d[i], g = d[i + 1], b = d[i + 2];
                if (r <= 100 && g >= 150 && b <= 100 && g > (r + b) * 1.3) d[i + 3] = 0;
              }
              extCtx.putImageData(data, 0, 0);
            }
            const fbLayer: Layer = {
              id: `fullbody-${Date.now()}`,
              name: 'Full Body',
              data: extCvs.toDataURL('image/png'),
              visible: true, opacity: 1, isLocked: false,
            };
            const next = [...layers, fbLayer];
            pushToHistory(next);
            mainLayersAfter = next;
            baseImage = fbLayer.data!;
            sfx.playSuccess();
          }
        }

        // Run each state's generation, store result in groupCache.
        const newCache: Record<string, Layer[]> = { ...groupCache, [activeGroupId]: mainLayersAfter };
        let firstFilledState: string | null = null;
        for (let i = 0; i < ANIMATION_PRESETS.length; i++) {
          const stp = ANIMATION_PRESETS[i];
          const okState = await confirmCall(
            `${i + 1}/${ANIMATION_PRESETS.length} · ${stp.label}`,
            `Animation: ${stp.pose}. ${stp.frames} frames as a 4×4 sheet. Goes into its own workspace; previous workspaces stay intact.`,
            costStr,
          );
          if (!okState) continue;

          const sheetW = canvasWidth * 4;
          const sheetH = canvasHeight * 4;
          const stateLayoutGuide = buildLayoutGuide(canvasWidth, canvasHeight, stp.frames);
          const finalPrompt = `${prompt}. Same character as the reference image. Do NOT change the character appearance, palette, or art style — only the pose changes between frames. Animation: ${stp.pose}. Render as a 4x4 grid sprite sheet on a ${sheetW}x${sheetH} canvas with ${canvasWidth}x${canvasHeight} cells. The attached LAYOUT GUIDE shows the exact cell boundaries: cells with a BLUE inner box and a number are ACTIVE — fill them with sequential animation frames in numbered order (1 → ${stp.frames}). Cells marked with X are INACTIVE — leave them transparent / chroma-key. Keep each frame INSIDE its blue safe area, never crossing cell boundaries. Do NOT draw the guide lines, numbers, or X marks in the output.`;
          const result = await runGeneration({
            prompt: finalPrompt,
            width: sheetW,
            height: sheetH,
            inputImage: baseImage,
            layoutGuide: stateLayoutGuide,
            selection: null,
            hasExistingArt: false,
            spriteMode: true,
          });
          const img = new Image();
          img.src = result;
          await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); });
          const frames = await sliceSheetIntoFrames(img, baseImage, stp.id, stp.frames);
          if (frames.length > 0) {
            newCache[stp.id] = frames;
            if (!firstFilledState) firstFilledState = stp.id;
          }
        }

        setGroupCache(newCache);
        setGenState({ isGenerating: false, error: null });
        // Auto-switch to the first generated state so user sees results
        if (firstFilledState) {
          const targetLayers = newCache[firstFilledState];
          setLayers(targetLayers);
          setHistory([targetLayers]);
          setHistoryIndex(0);
          setActiveLayerId(targetLayers[0]?.id ?? '');
          setActiveGroupId(firstFilledState);
          setSpritePlaying(false);
          setSpriteFrameIndex(0);
          // Canvas size stays as the user set it (e.g. 128 for full-body work).
        }
        sfx.playSuccess();
      } catch (err) {
        setGenState({
          isGenerating: false,
          error: err instanceof Error ? err.message : 'Full Set generation failed.',
        });
      }
      return;
    }


    setGenState({ isGenerating: true, error: null });
    try {
      const composite = await getCompositeImage();
      const hasExistingArt = layers.some(l => l.visible && l.data);

      // Optional pre-step: extend the canvas to a full-body sprite if the
      // user requested it and no full-body layer exists yet.
      const hasFullBody = layers.some(l => l.name.startsWith('Full Body') && l.data);
      let baseImage = hasExistingArt ? composite : undefined;
      if (spriteMode && fullBody && !hasFullBody && hasExistingArt) {
        const okExt = await confirmCall(
          'Generate full-body base',
          'AI will extend the existing canvas into a full-body sprite that becomes the canonical reference for every frame. The original layers are kept; a new "Full Body" layer is added on top.',
          costStr,
        );
        if (!okExt) { setGenState({ isGenerating: false, error: null }); return; }

        // Extension call MUST be neutral — see Full Set branch comment above.
        const extPrompt = `Take the attached reference image and extend it into a complete full-body character sprite in a NEUTRAL STANDING POSE. Keep every existing pixel of the head and shoulders unchanged. Add the rest of the body, arms (relaxed at sides), hands, legs (standing flat together), and feet in the exact same pixel-art style, palette, and outline weight as the reference. Do NOT change the character appearance, do NOT change the art style, do NOT redesign anything. Do NOT animate, do NOT add pose, motion, expression change, action, or scenery. Output a single centered, idle, full-body sprite on a flat ${transparentBg ? 'BRIGHT GREEN (#00FF00) chroma-key' : 'fitting'} background.`;
        const extResult = await runGeneration({
          prompt: extPrompt,
          width: canvasWidth,
          height: canvasHeight,
          inputImage: composite,
          selection: null,
          hasExistingArt: true,
          spriteMode: false,
        });

        const extImg = new Image();
        extImg.src = extResult;
        await new Promise<void>(r => { extImg.onload = () => r(); extImg.onerror = () => r(); });
        const extCvs = document.createElement('canvas');
        extCvs.width = canvasWidth; extCvs.height = canvasHeight;
        const extCtx = extCvs.getContext('2d', { willReadFrequently: true });
        if (extCtx) {
          extCtx.drawImage(extImg, 0, 0, canvasWidth, canvasHeight);
          if (transparentBg && autoChromaKey) {
            const data = extCtx.getImageData(0, 0, canvasWidth, canvasHeight);
            const d = data.data;
            for (let i = 0; i < d.length; i += 4) {
              const r = d[i], g = d[i + 1], b = d[i + 2];
              if (r <= 100 && g >= 150 && b <= 100 && g > (r + b) * 1.3) d[i + 3] = 0;
            }
            extCtx.putImageData(data, 0, 0);
          }
          const fbLayer: Layer = {
            id: `fullbody-${Date.now()}`,
            name: 'Full Body',
            data: extCvs.toDataURL('image/png'),
            visible: true,
            opacity: 1,
            isLocked: false,
          };
          const next = [...layers, fbLayer];
          pushToHistory(next);
          setActiveLayerId(fbLayer.id);
          baseImage = fbLayer.data!;
          sfx.playSuccess();
        }
      }

      // Main generation step (animation or single image)
      const okMain = await confirmCall(
        spriteMode
          ? `Generate ${preset ? preset.label : 'animation'} sprite sheet`
          : 'Generate image',
        spriteMode
          ? `${preset ? `Preset: ${preset.label} (${preset.frames} frames). Pose: ${preset.pose}. ` : ''}AI will produce a 4×4 sprite sheet (16 frames) using the current canvas as reference.`
          : 'AI will produce a single image based on your prompt and current canvas.',
        costStr,
      );
      if (!okMain) { setGenState({ isGenerating: false, error: null }); return; }

      const sheetW = canvasWidth * 4;
      const sheetH = canvasHeight * 4;
      const genWidth = spriteMode ? sheetW : canvasWidth;
      const genHeight = spriteMode ? sheetH : canvasHeight;
      // Frame count: preset's spec, or 16 for "Custom".
      const activeFrameCount = preset?.frames ?? 16;
      const layoutGuide = spriteMode ? buildLayoutGuide(canvasWidth, canvasHeight, activeFrameCount) : undefined;
      const finalPrompt = spriteMode
        ? (preset
            ? `${prompt}. Same character as the reference image. Do NOT change the character appearance, palette, or art style — only the pose changes between frames. Animation: ${preset.pose}. Render as a 4x4 grid sprite sheet on a ${sheetW}x${sheetH} canvas with ${canvasWidth}x${canvasHeight} cells. The attached LAYOUT GUIDE shows exact cell boundaries: cells with a BLUE inner box and a number are ACTIVE — fill them with sequential animation frames in numbered order (1 → ${preset.frames}). Cells marked with X are INACTIVE — leave them transparent / chroma-key. Keep each frame INSIDE its blue safe area, never crossing cell boundaries. Do NOT draw the guide lines, numbers, or X marks in the output.`
            : `${prompt}. Same character as the reference image. Do NOT change the character appearance, palette, or art style — only the pose changes. Render as a 4x4 grid sprite sheet on a ${sheetW}x${sheetH} canvas with ${canvasWidth}x${canvasHeight} cells. The attached LAYOUT GUIDE shows exact cell boundaries — fill all 16 cells with sequential animation frames in numbered order (1 → 16). Keep each frame INSIDE its blue safe area, never crossing cell boundaries. Do NOT draw the guide lines or numbers in the output.`)
        : prompt;
      const result = await runGeneration({
        prompt: finalPrompt,
        width: genWidth,
        height: genHeight,
        inputImage: baseImage,
        layoutGuide,
        selection: spriteMode ? null : selection,
        hasExistingArt: spriteMode ? false : hasExistingArt,
        spriteMode,
      });
      const img = new Image();
      img.src = result;
      await new Promise<void>(r => { img.onload = () => r(); img.onerror = () => r(); });

      if (spriteMode) {
        // Use baseImage (the post-extension full body if Full Body was on,
        // otherwise the original composite) as the palette + identity
        // reference for slicing. Earlier this was hardcoded to `composite`,
        // which was the PRE-extension snapshot — so any colors introduced
        // by the full-body extension (e.g. new body pixels) were force-
        // snapped AWAY to the bust-only palette. That was a real bug: the
        // animation looked like "didn't reference the full body".
        const sliceRef = hasExistingArt ? baseImage : undefined;
        const frames = await sliceSheetIntoFrames(img, sliceRef, 'Frame', activeFrameCount);
        if (frames.length === 0) { setGenState({ isGenerating: false, error: null }); return; }
        // Sync editor's custom-color swatches with the same authoritative
        // reference (full body if present).
        if (hasExistingArt && sliceRef) {
          const refImg = new Image();
          refImg.src = sliceRef;
          await new Promise<void>(r => { refImg.onload = () => r(); refImg.onerror = () => r(); });
          const refCvs = document.createElement('canvas');
          refCvs.width = canvasWidth; refCvs.height = canvasHeight;
          const refCtx = refCvs.getContext('2d', { willReadFrequently: true });
          if (refCtx) {
            refCtx.drawImage(refImg, 0, 0);
            const refData = refCtx.getImageData(0, 0, canvasWidth, canvasHeight);
            const centroids = quantizeImageData(refData, 16);
            const palette = centroids.map(rgbToHex);
            if (palette.length > 0) {
              setCustomColors(palette);
              setActivePalette({ name: '__custom__', colors: [] });
            }
          }
        }
        // Canvas size stays as the user set it. Earlier versions forced 64x64
        // here, which was the source of the "minyon" output bug when the user
        // had bumped canvas to 128 for full-body work.
        pushToHistory(frames);
        setActiveLayerId(frames[0].id);
        setSpriteFrameIndex(0);
        sfx.playSuccess();
        return;
      }

      const cvs = document.createElement('canvas');
      cvs.width = canvasWidth; cvs.height = canvasHeight;
      const ctx = cvs.getContext('2d');
      if (ctx) {
          ctx.drawImage(img, 0, 0, canvasWidth, canvasHeight);
          const origData = cvs.toDataURL('image/png');
          const imgData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
          if (transparentBg && autoChromaKey) {
            const d = imgData.data;
            for (let i = 0; i < d.length; i += 4) {
              const r = d[i], g = d[i + 1], b = d[i + 2];
              const isChroma = r <= 100 && g >= 150 && b <= 100 && g > (r + b) * 1.3;
              if (isChroma) d[i + 3] = 0;
            }
          }
          let extractedPalette: string[] | null = null;
          if (activePalette.colors.length > 0) {
            const d = imgData.data;
            const pal = activePalette.colors.map(hex => [
              parseInt(hex.slice(1, 3), 16),
              parseInt(hex.slice(3, 5), 16),
              parseInt(hex.slice(5, 7), 16),
            ]);
            for (let i = 0; i < d.length; i += 4) {
              if (d[i + 3] < 128) continue;
              let bestD = Infinity;
              let best = pal[0];
              for (const c of pal) {
                const dr = d[i] - c[0], dg = d[i + 1] - c[1], db = d[i + 2] - c[2];
                const dist = dr * dr + dg * dg + db * db;
                if (dist < bestD) { bestD = dist; best = c; }
              }
              d[i] = best[0]; d[i + 1] = best[1]; d[i + 2] = best[2]; d[i + 3] = 255;
            }
          } else {
            const centroids = quantizeImageData(imgData, simplifyK);
            extractedPalette = centroids.map(rgbToHex);
          }
          ctx.putImageData(imgData, 0, 0);
          const layerName = `AI: ${prompt}`;
          const newId = `layer-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          const newLayer: Layer = { id: newId, name: layerName, data: cvs.toDataURL('image/png'), visible: true, opacity: 1, isLocked: false };
          setOriginalLayerData(prev => { const next = new Map(prev); next.set(newId, origData); return next; });
          simplifySourceRef.current.set(newId, origData);
          pushToHistory([newLayer, ...layers]);
          setActiveLayerId(newId);
          if (extractedPalette) {
            setCustomColors(extractedPalette);
            setActivePalette({ name: '__custom__', colors: [] });
          }
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
  // Decodes every GIF frame into its own layer, sizes the canvas to the GIF,
  // enables sprite (animation) mode, and seeds FPS from the GIF's frame delay.
  const importGifAsAnimation = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const { parseGIF, decompressFrames } = await import('gifuct-js');
      const gif = parseGIF(buf);
      const rawFrames = decompressFrames(gif, true);
      if (!rawFrames.length) {
        sfx.playError();
        return;
      }

      const gifW = gif.lsd.width;
      const gifH = gif.lsd.height;
      let fitW = gifW;
      let fitH = gifH;
      const longest = Math.max(fitW, fitH);
      if (longest > MAX_CANVAS_SIZE) {
        const scale = MAX_CANVAS_SIZE / longest;
        fitW = Math.round(fitW * scale);
        fitH = Math.round(fitH * scale);
      }
      fitW = Math.max(MIN_CANVAS_SIZE, fitW);
      fitH = Math.max(MIN_CANVAS_SIZE, fitH);

      // Compose canvas at native GIF size, then resample each composed frame
      // down to the editor canvas — this preserves disposal logic correctly
      // (frames can reference pixels outside their own dirty rect).
      const compose = document.createElement('canvas');
      compose.width = gifW;
      compose.height = gifH;
      const cctx = compose.getContext('2d');
      const out = document.createElement('canvas');
      out.width = fitW;
      out.height = fitH;
      const octx = out.getContext('2d');
      if (!cctx || !octx) {
        sfx.playError();
        return;
      }
      octx.imageSmoothingEnabled = false;

      const frameDataUrls: string[] = [];
      let totalDelayMs = 0;
      for (const frame of rawFrames) {
        const patchCanvas = document.createElement('canvas');
        patchCanvas.width = frame.dims.width;
        patchCanvas.height = frame.dims.height;
        const pctx = patchCanvas.getContext('2d');
        if (!pctx) continue;
        const patchImage = new ImageData(
          new Uint8ClampedArray(frame.patch),
          frame.dims.width,
          frame.dims.height,
        );
        pctx.putImageData(patchImage, 0, 0);
        cctx.drawImage(patchCanvas, frame.dims.left, frame.dims.top);

        octx.clearRect(0, 0, fitW, fitH);
        octx.drawImage(compose, 0, 0, fitW, fitH);
        frameDataUrls.push(out.toDataURL('image/png'));

        // Disposal type 2 = restore-to-background. Other disposal types leave
        // the compose canvas as-is, which is what most sprite-sheet GIFs want.
        if (frame.disposalType === 2) {
          cctx.clearRect(frame.dims.left, frame.dims.top, frame.dims.width, frame.dims.height);
        }
        totalDelayMs += frame.delay || 100;
      }

      if (fitW !== canvasWidth || fitH !== canvasHeight) {
        setCanvasWidth(fitW);
        setCanvasHeight(fitH);
      }

      const baseId = Date.now();
      const newLayers: Layer[] = frameDataUrls.map((data, i) => ({
        id: `gif-${baseId}-${i}`,
        name: `Frame ${i + 1}`,
        data,
        visible: true,
        opacity: 1,
        isLocked: false,
      }));
      pushToHistory(newLayers);
      setActiveLayerId(newLayers[0].id);

      const avgDelay = Math.max(20, totalDelayMs / frameDataUrls.length);
      const fps = Math.min(30, Math.max(1, Math.round(1000 / avgDelay)));
      setSpriteFps(fps);
      setSpriteMode(true);
      setSpriteFrameIndex(0);
      setSpritePlaying(false);

      sfx.playSuccess();
    } catch (err) {
      console.error('GIF import failed:', err);
      sfx.playError();
    }
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const hasExistingArt = layers.some(l => l.data);
    if (!hasExistingArt) {
      const fullColor = PALETTE_PRESETS.find(p => p.name === 'Full Color');
      if (fullColor) setActivePalette(fullColor);
    }

    const isGif = file.type === 'image/gif' || /\.gif$/i.test(file.name);
    if (isGif) {
      void importGifAsAnimation(file);
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        // Use the image's NATIVE size. Only scale down if the image is
        // bigger than the editor's MAX_CANVAS_SIZE (current ceiling: 256
        // px on the longest edge). Aspect ratio is preserved.
        // Previously we capped at the CURRENT canvas size, which silently
        // shrank a 256×256 upload to 64×64 — confusing and made the
        // reference too small for AI generation.
        let fitW = img.naturalWidth;
        let fitH = img.naturalHeight;
        const longest = Math.max(fitW, fitH);
        if (longest > MAX_CANVAS_SIZE) {
          const scale = MAX_CANVAS_SIZE / longest;
          fitW = Math.round(fitW * scale);
          fitH = Math.round(fitH * scale);
        }
        fitW = Math.max(MIN_CANVAS_SIZE, fitW);
        fitH = Math.max(MIN_CANVAS_SIZE, fitH);
        // Canvas grows to fit the image. If there's existing art we keep
        // whichever dimension is larger so we don't shrink current work.
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
          <HolderGate toolName="Pixel Forge">
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

              {/* Canvas Size */}
              <div className="border-2 border-neutral-700 dark:border-neutral-200 p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50" style={font}>Canvas Size</p>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min={MIN_CANVAS_SIZE}
                    max={MAX_CANVAS_SIZE}
                    value={canvasWidth}
                    onChange={e => setCanvasWidth(Math.min(MAX_CANVAS_SIZE, Math.max(MIN_CANVAS_SIZE, Number(e.target.value) || MIN_CANVAS_SIZE)))}
                    className="flex-1 bg-transparent border border-neutral-700 dark:border-neutral-600 px-1 py-1 text-[10px] text-foreground text-center focus:outline-none focus:border-foreground"
                    style={font}
                  />
                  <span className="text-[10px] text-muted-foreground/40" style={font}>x</span>
                  <input
                    type="number"
                    min={MIN_CANVAS_SIZE}
                    max={MAX_CANVAS_SIZE}
                    value={canvasHeight}
                    onChange={e => setCanvasHeight(Math.min(MAX_CANVAS_SIZE, Math.max(MIN_CANVAS_SIZE, Number(e.target.value) || MIN_CANVAS_SIZE)))}
                    className="flex-1 bg-transparent border border-neutral-700 dark:border-neutral-600 px-1 py-1 text-[10px] text-foreground text-center focus:outline-none focus:border-foreground"
                    style={font}
                  />
                </div>
                <div className="grid grid-cols-6 gap-px">
                  {CANVAS_PRESETS.map(s => {
                    const currentMax = Math.max(canvasWidth, canvasHeight);
                    const isActive = currentMax === s;
                    return (
                      <button
                        key={s}
                        onClick={() => {
                          sfx.playClick();
                          const ratio = s / currentMax;
                          const newW = Math.max(MIN_CANVAS_SIZE, Math.min(MAX_CANVAS_SIZE, Math.round(canvasWidth * ratio)));
                          const newH = Math.max(MIN_CANVAS_SIZE, Math.min(MAX_CANVAS_SIZE, Math.round(canvasHeight * ratio)));
                          setCanvasWidth(newW); setCanvasHeight(newH);
                        }}
                        className={`px-1 py-1 text-[9px] border transition-colors ${
                          isActive
                            ? 'border-foreground bg-foreground/10 text-foreground'
                            : 'border-neutral-700 dark:border-neutral-600 text-muted-foreground/40 hover:border-foreground/50'
                        }`}
                        style={font}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-7 gap-px">
                  {ASPECT_RATIOS.map(r => {
                    const ratioW = canvasWidth / canvasHeight;
                    const targetW = r.w / r.h;
                    const isActive = Math.abs(ratioW - targetW) < 0.02;
                    return (
                      <button
                        key={r.label}
                        onClick={() => {
                          sfx.playClick();
                          const base = Math.max(canvasWidth, canvasHeight);
                          let newW: number, newH: number;
                          if (r.w >= r.h) {
                            newW = base;
                            newH = Math.round(base * r.h / r.w);
                          } else {
                            newH = base;
                            newW = Math.round(base * r.w / r.h);
                          }
                          newW = Math.max(MIN_CANVAS_SIZE, Math.min(MAX_CANVAS_SIZE, newW));
                          newH = Math.max(MIN_CANVAS_SIZE, Math.min(MAX_CANVAS_SIZE, newH));
                          setCanvasWidth(newW); setCanvasHeight(newH);
                        }}
                        className={`px-0.5 py-1 text-[8px] border transition-colors ${
                          isActive
                            ? 'border-foreground bg-foreground/10 text-foreground'
                            : 'border-neutral-700 dark:border-neutral-600 text-muted-foreground/40 hover:border-foreground/50'
                        }`}
                        style={font}
                      >
                        {r.label}
                      </button>
                    );
                  })}
                </div>
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
                  <button
                    onClick={() => { sfx.playClick(); handleInvertLayer(); }}
                    className="p-2 border border-neutral-700 dark:border-neutral-600 hover:border-foreground/50 transition-colors"
                    title="Invert colors (selection if active)"
                  >
                    <Contrast className="w-3.5 h-3.5 mx-auto" />
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
                  {activePalette.name === '__custom__' && customColors.map((color, i) => {
                    const isEmpty = !color;
                    return (
                    <div key={`c-${i}`} className="relative group">
                      <label
                        className={`relative block w-full aspect-square border cursor-pointer transition-colors ${
                          isEmpty
                            ? 'border-dashed border-foreground/40 hover:border-foreground'
                            : primaryColor === color
                              ? 'border-foreground ring-1 ring-foreground'
                              : 'border-neutral-700 dark:border-neutral-600 hover:border-foreground/60'
                        }`}
                        style={isEmpty ? {
                          backgroundImage: 'linear-gradient(45deg, #888 25%, transparent 25%), linear-gradient(-45deg, #888 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #888 75%), linear-gradient(-45deg, transparent 75%, #888 75%)',
                          backgroundSize: '6px 6px',
                          backgroundPosition: '0 0, 0 3px, 3px -3px, -3px 0px',
                        } : { backgroundColor: color }}
                        title={color || 'Pick a color'}
                        onClick={() => { if (!isEmpty) { sfx.playClick(); setPrimaryColor(color); } }}
                      >
                        <input
                          type="color"
                          value={isEmpty ? '#ffffff' : color}
                          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                          onInput={e => { const c = (e.target as HTMLInputElement).value; setCustomColors(prev => prev.map((cc, j) => j === i ? c : cc)); }}
                          onChange={e => { const c = e.target.value; setCustomColors(prev => prev.map((cc, j) => j === i ? c : cc)); setPrimaryColor(c); }}
                        />
                      </label>
                      <button
                        onClick={e => { e.stopPropagation(); sfx.playClick(); setCustomColors(prev => prev.filter((_, j) => j !== i)); }}
                        className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 text-white text-[7px] leading-none rounded-full hidden group-hover:flex items-center justify-center"
                      >
                        x
                      </button>
                    </div>
                    );
                  })}
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

                <div className="mt-2">
                  <PixelSlider label="Simplify" value={Math.min(simplifyK, simplifyMax)} min={2} max={simplifyMax} display={`${Math.min(simplifyK, simplifyMax)}`} onChange={handleSimplifyChange} />
                </div>

                <div className="mt-2 space-y-2">
                  <PixelSlider label="Brush" value={brushSize} min={1} max={10} display={`${brushSize}px`} onChange={v => { setBrushSize(v); sfx.playSlider(v / 10); }} />
                  <PixelSlider label="Zoom" value={zoom} min={0.25} max={8} step={0.25} display={`${Math.round(zoom * 100)}%`} onChange={v => { setZoom(v); sfx.playSlider(v / 8); }} />
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
                  {layers.map((layer, idx) => (
                    <div
                      key={layer.id}
                      onClick={() => {
                        sfx.playClick();
                        setActiveLayerId(layer.id);
                        // In sprite mode, clicking a layer should also stop playback
                        // and snap the displayed frame to that layer so the canvas
                        // shows what you're about to edit.
                        if (spriteMode) {
                          setSpritePlaying(false);
                          setSpriteFrameIndex(idx);
                        }
                      }}
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
                        {spriteMode && (
                          <button
                            onClick={e => { e.stopPropagation(); sfx.playClick(); handleRegenerateFrame(layer.id); }}
                            disabled={genState.isGenerating || !prompt.trim() || !apiKey.trim()}
                            className="text-muted-foreground/30 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Regenerate this frame with AI"
                          >
                            <RefreshCcw className="w-3 h-3" />
                          </button>
                        )}
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
                <button
                  onClick={() => { sfx.playClick(); handleRevertLayer(); }}
                  disabled={!activeLayer || (!simplifySourceRef.current.has(activeLayerId) && !originalLayerData.has(activeLayerId))}
                  className="w-full flex items-center justify-center gap-2 border border-neutral-700 dark:border-neutral-600 p-1.5 text-[10px] uppercase disabled:opacity-30 hover:bg-foreground/5 transition-colors"
                  style={font}
                  title="Restore this layer's original colors (pre-edit)"
                >
                  <RotateCcw className="w-3 h-3" /> Revert
                </button>
                <button onClick={() => { sfx.playClick(); handleClearLayer(); }} disabled={!activeLayer || activeLayer.isLocked} className="w-full flex items-center justify-center gap-2 border border-neutral-700 dark:border-neutral-600 p-1.5 text-[10px] uppercase disabled:opacity-30 hover:bg-red-500/10 transition-colors" style={font}>
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
                <select
                  value={downloadScale}
                  onChange={e => { sfx.playSelect(); setDownloadScale(Number(e.target.value)); }}
                  className="w-full border border-neutral-700 dark:border-neutral-600 bg-background px-1.5 py-1.5 text-[10px] focus:outline-none text-foreground"
                  style={font}
                >
                  {SCALE_OPTIONS.map(s => (
                    <option key={s} value={s}>{s}x ({canvasWidth * s}x{canvasHeight * s}px)</option>
                  ))}
                </select>
                <div className="space-y-1">
                  <button onClick={() => { sfx.playSuccess(); handleDownload(); }} className="w-full flex items-center justify-center gap-1 border-2 border-neutral-700 dark:border-neutral-200 p-1.5 text-[10px] uppercase hover:bg-foreground/5 transition-colors" style={font}>
                    <Download className="w-3 h-3" /> PNG
                  </button>
                  {spriteMode && layers.length >= 2 && (
                    <div className="grid grid-cols-2 gap-1">
                      <button onClick={() => { sfx.playSuccess(); handleExportFramesZip(); }} className="flex items-center justify-center gap-1 border border-neutral-700 dark:border-neutral-600 p-1.5 text-[10px] uppercase hover:bg-foreground/5 transition-colors" style={font}>
                        <Download className="w-3 h-3" /> ZIP
                      </button>
                      <button onClick={() => { sfx.playSuccess(); handleExportGif(); }} className="flex items-center justify-center gap-1 border border-neutral-700 dark:border-neutral-600 p-1.5 text-[10px] uppercase hover:bg-foreground/5 transition-colors" style={font}>
                        <Download className="w-3 h-3" /> GIF
                      </button>
                      <button onClick={() => { sfx.playSuccess(); handleExportMp4(); }} title="MP4 (WebCodecs, modern browsers)" className="flex items-center justify-center gap-1 border border-neutral-700 dark:border-neutral-600 p-1.5 text-[10px] uppercase hover:bg-foreground/5 transition-colors" style={font}>
                        <Download className="w-3 h-3" /> MP4
                      </button>
                      <button onClick={() => { sfx.playSuccess(); handleExportWebpAtlas(); }} title="WebP atlas (Codex-style spritesheet)" className="flex items-center justify-center gap-1 border border-neutral-700 dark:border-neutral-600 p-1.5 text-[10px] uppercase hover:bg-foreground/5 transition-colors" style={font}>
                        <Download className="w-3 h-3" /> WEBP
                      </button>
                      <button onClick={() => { sfx.playSuccess(); handleExportAsepriteBundle(); }} title="PNG + Aseprite Hash JSON (open with File > Import Sprite Sheet)" className="col-span-2 flex items-center justify-center gap-1 border border-neutral-700 dark:border-neutral-600 p-1.5 text-[10px] uppercase hover:bg-foreground/5 transition-colors" style={font}>
                        <Download className="w-3 h-3" /> Aseprite (.zip)
                      </button>
                      <button onClick={() => { sfx.playSuccess(); handleExportCodexPet(); }} title="Codex pet bundle (pet.json + spritesheet.webp). Drop the unzipped folder into ~/.codex/pets/" className="col-span-2 flex items-center justify-center gap-1 border border-neutral-700 dark:border-neutral-600 p-1.5 text-[10px] uppercase hover:bg-foreground/5 transition-colors" style={font}>
                        <Download className="w-3 h-3" /> Codex Pet (.zip)
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Canvas */}
            <div className="flex-1 border-2 border-neutral-700 dark:border-neutral-200 bg-muted/20 overflow-hidden min-h-[400px] lg:h-[calc(100vh-220px)] lg:max-h-[900px] lg:self-start flex flex-col">
              {visibleGroupIds.length > 1 && (
                <div className="border-b border-neutral-200 dark:border-neutral-700 px-3 py-1.5 flex items-center gap-2 text-[10px]" style={font}>
                  <button
                    onClick={() => { sfx.playClick(); switchPrevGroup(); }}
                    disabled={visibleGroupIds.indexOf(activeGroupId) <= 0}
                    className="border border-neutral-700 dark:border-neutral-600 px-1.5 py-0.5 uppercase hover:bg-foreground/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Previous workspace (←)"
                    style={font}
                  >
                    &lt;
                  </button>
                  <span className="text-muted-foreground uppercase tracking-wider">Workspace</span>
                  <span className="text-foreground font-bold">
                    {(() => {
                      if (activeGroupId === 'main') return 'Main';
                      const p = ANIMATION_PRESETS.find(x => x.id === activeGroupId);
                      return p?.label ?? activeGroupId;
                    })()}
                  </span>
                  <span className="text-muted-foreground/60">
                    ({visibleGroupIds.indexOf(activeGroupId) + 1}/{visibleGroupIds.length})
                  </span>
                  <button
                    onClick={() => { sfx.playClick(); switchNextGroup(); }}
                    disabled={visibleGroupIds.indexOf(activeGroupId) >= visibleGroupIds.length - 1}
                    className="border border-neutral-700 dark:border-neutral-600 px-1.5 py-0.5 uppercase hover:bg-foreground/5 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Next workspace (→)"
                    style={font}
                  >
                    &gt;
                  </button>
                  <span className="ml-auto text-muted-foreground/40 text-[9px] hidden sm:inline">use ← → keys</span>
                </div>
              )}
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
                  soloLayerIndex={spriteMode ? spriteFrameIndex : undefined}
                />
              </div>
              {spriteMode && layers.length >= 2 && (
                <div className="border-t border-neutral-200 dark:border-neutral-700 px-3 py-2 flex flex-wrap items-center gap-3 text-[10px]" style={font}>
                  <button
                    onClick={() => { sfx.playClick(); setSpritePlaying(p => !p); }}
                    className="border-2 border-neutral-700 dark:border-neutral-200 px-3 py-1 uppercase hover:bg-foreground/5 transition-colors min-w-[72px]"
                    style={font}
                  >
                    {spritePlaying ? 'Pause' : 'Play'}
                  </button>
                  <button
                    onClick={() => { sfx.playClick(); setSpritePlaying(false); setSpriteFrameIndex(i => (i - 1 + layers.length) % layers.length); }}
                    className="border border-neutral-700 dark:border-neutral-600 px-2 py-1 uppercase hover:bg-foreground/5 transition-colors"
                    style={font}
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => { sfx.playClick(); setSpritePlaying(false); setSpriteFrameIndex(i => (i + 1) % layers.length); }}
                    className="border border-neutral-700 dark:border-neutral-600 px-2 py-1 uppercase hover:bg-foreground/5 transition-colors"
                    style={font}
                  >
                    Next
                  </button>
                  <span className="text-muted-foreground uppercase tracking-wider">
                    Frame {spriteFrameIndex + 1} / {layers.length}
                  </span>
                  <div className="flex items-center gap-2 min-w-[160px]">
                    <span className="text-muted-foreground uppercase tracking-wider">FPS</span>
                    <input
                      type="range"
                      min={1}
                      max={24}
                      value={spriteFps}
                      onChange={e => setSpriteFps(Number(e.target.value))}
                      className="flex-1 accent-foreground cursor-pointer"
                    />
                    <span className="w-6 text-right text-muted-foreground">{spriteFps}</span>
                  </div>
                </div>
              )}
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
                <label className="flex items-center gap-1.5 text-[9px] uppercase text-muted-foreground cursor-pointer select-none" style={font}>
                  <input type="checkbox" checked={transparentBg} onChange={e => { sfx.playClick(); setTransparentBg(e.target.checked); }} className="cursor-pointer accent-foreground" />
                  Transparent bg
                </label>
                <label className={`flex items-center gap-1.5 text-[9px] uppercase cursor-pointer select-none ${transparentBg ? 'text-muted-foreground' : 'text-muted-foreground/30 pointer-events-none'}`} style={font}>
                  <input type="checkbox" checked={autoChromaKey} disabled={!transparentBg} onChange={e => { sfx.playClick(); setAutoChromaKey(e.target.checked); }} className="cursor-pointer accent-foreground disabled:cursor-not-allowed" />
                  Auto chroma key
                </label>
                <label className="flex items-center gap-1.5 text-[9px] uppercase text-muted-foreground cursor-pointer select-none" style={font}>
                  <input type="checkbox" checked={spriteMode} onChange={e => { sfx.playClick(); setSpriteMode(e.target.checked); }} className="cursor-pointer accent-foreground" />
                  Animation (4×4, 16 frames)
                </label>
                {spriteMode && (
                  <div className="mt-1 space-y-1.5 border-l-2 border-neutral-700/40 dark:border-neutral-300/40 pl-2">
                    <div>
                      <p className="text-[8px] uppercase tracking-wider text-muted-foreground/60 mb-1" style={font}>Preset</p>
                      <select
                        value={animationPresetId}
                        onChange={e => { sfx.playSelect(); setAnimationPresetId(e.target.value); }}
                        className="w-full bg-background border border-neutral-700 dark:border-neutral-600 px-2 py-1 text-[10px] focus:outline-none focus:border-foreground text-foreground cursor-pointer"
                        style={font}
                      >
                        <option value="custom">Custom (use my prompt)</option>
                        {ANIMATION_PRESETS.map(p => (
                          <option key={p.id} value={p.id}>{p.label}</option>
                        ))}
                        <option value={FULL_SET_PRESET_ID}>Full Set — Codex BOOA (9 calls)</option>
                      </select>
                    </div>
                    <label
                      className="flex items-center gap-1.5 text-[9px] uppercase text-muted-foreground cursor-pointer select-none"
                      style={font}
                      title={'Generate a full-body extension first, then animate. The pet is rendered at the canvas size you chose — no auto-resizing, no scaling.'}
                    >
                      <input
                        type="checkbox"
                        checked={fullBody}
                        onChange={e => {
                          sfx.playClick();
                          setFullBody(e.target.checked);
                        }}
                        className="cursor-pointer accent-foreground"
                      />
                      Full body
                      {fullBody && (
                        <span className="text-[8px] text-muted-foreground/60 normal-case ml-1" style={font}>
                          (canvas {canvasWidth}×{canvasHeight})
                        </span>
                      )}
                    </label>
                  </div>
                )}
                <button
                  onClick={() => { sfx.playClick(); handleGenerate(); }}
                  disabled={genState.isGenerating || !prompt.trim()}
                  className="w-full flex items-center justify-center gap-2 border-2 border-neutral-700 dark:border-neutral-200 p-2 text-[10px] uppercase disabled:opacity-30 hover:bg-foreground/5 transition-colors"
                  style={font}
                >
                  {genState.isGenerating ? <><Loader2 className="w-3 h-3 animate-spin" /> Generating...</> : <><Wand2 className="w-3 h-3" /> Generate</>}
                </button>
              </div>

              {/* Provider + API Key */}
              <div className="border-2 border-neutral-700 dark:border-neutral-200 p-3 space-y-2">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50" style={font}>Provider</p>
                <div className="grid grid-cols-3 gap-1">
                  {AI_MODELS.map((m) => {
                    const active = m.id === selectedModelId;
                    const label = m.provider === 'gemini' ? 'Gemini' : m.provider === 'openai' ? 'OpenAI' : 'Replicate';
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => { sfx.playSelect(); setSelectedModelId(m.id); }}
                        title={m.label}
                        className={`px-1 py-1.5 text-[9px] uppercase tracking-tight border transition-colors truncate ${
                          active
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900'
                        }`}
                        style={font}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>

                <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 pt-1" style={font}>API key</p>
                <div className="flex gap-1">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => handleApiKeyChange(e.target.value)}
                    placeholder={selectedModel.keyPlaceholder}
                    className="flex-1 bg-background border border-neutral-700 dark:border-neutral-600 px-2 py-1.5 text-[10px] focus:outline-none focus:border-foreground text-foreground placeholder:text-muted-foreground/30"
                    style={font}
                  />
                  <button
                    type="button"
                    onClick={() => { sfx.playClick(); setShowKey((v) => !v); }}
                    className="border border-neutral-700 dark:border-neutral-600 px-2 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
                    title={showKey ? 'Hide' : 'Show'}
                  >
                    {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={PROVIDER_KEY_DOCS[selectedModel.provider]}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    style={font}
                  >
                    Where do I find my API key? <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                  {(() => {
                    const cost = selectedModel.provider === 'replicate'
                      ? getRDCost(rdStyle, canvasWidth, canvasHeight)
                      : selectedModel.costPerImage;
                    return (
                      <span
                        title={`Estimated: ~$${cost.toFixed(3)} per image at ${canvasWidth}x${canvasHeight} (${selectedModel.label})\n\nPixel Forge calls the provider directly with your key. The key is read from this browser only and never sent to BOOA servers.`}
                        className="inline-flex items-center justify-center w-3 h-3 border border-muted-foreground/40 text-[8px] text-muted-foreground hover:border-foreground hover:text-foreground transition-colors cursor-help"
                      >
                        ?
                      </span>
                    );
                  })()}
                </div>

                {selectedModel.provider === 'replicate' && (
                  <>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/50 pt-1" style={font}>Style</p>
                    <select
                      value={rdStyle}
                      onChange={e => { sfx.playSelect(); setRdStyle(e.target.value); }}
                      className="w-full bg-background border border-neutral-700 dark:border-neutral-600 px-2 py-1.5 text-[10px] focus:outline-none focus:border-foreground text-foreground cursor-pointer"
                      style={font}
                    >
                      {RD_STYLES.map(s => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </>
                )}
              </div>

            </div>
          </div>
          </HolderGate>

            </div>
            <div className="hidden lg:block lg:col-span-1" />
          </div>
        </div>
      </main>
      <Footer />

      {/* Per-call confirmation modal */}
      {confirmDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={confirmDialog.onCancel}
        >
          <div
            className="w-full max-w-sm bg-background border-2 border-neutral-700 dark:border-neutral-200 p-5 space-y-4"
            onClick={e => e.stopPropagation()}
            style={font}
          >
            <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60">
              Confirm AI call
            </p>
            <h3 className="text-sm text-foreground">{confirmDialog.title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {confirmDialog.description}
            </p>
            <p className="text-[10px] text-muted-foreground/70 border-t border-border pt-3">
              {confirmDialog.cost}
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { sfx.playClick(); confirmDialog.onCancel(); }}
                className="flex-1 h-9 border-2 border-neutral-700 dark:border-neutral-200 text-[10px] uppercase hover:bg-foreground/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { sfx.playClick(); confirmDialog.onConfirm(); }}
                className="flex-1 h-9 border-2 border-neutral-700 dark:border-neutral-200 bg-neutral-700 dark:bg-neutral-200 text-white dark:text-neutral-900 text-[10px] uppercase hover:bg-neutral-600 dark:hover:bg-neutral-300 transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
