'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Loader2, Upload, Download, Search, Eye, EyeOff, ArrowLeft, ExternalLink, Ban } from 'lucide-react';
import {
  ALLOWED_CELL_SIZES,
  ATLAS_COLS,
  ATLAS_ROWS,
  DEFAULT_CELL_SIZE,
  DEFAULT_PIPELINE_SETTINGS,
  DEFAULT_PRESET_ID,
  DEFAULT_REFERENCE_URL,
  MAX_GRID_DIM,
  MIN_GRID_DIM,
  PROVIDERS,
  SPRITE_PRESETS,
  buildGenericRowMap,
  rowMapFromPreset,
  type CellSize,
  type PipelineResult,
  type Provider,
  type SpriteworksJob,
} from '@/lib/spriteworks/types';
import { runSpriteworksJob, buildResultZip, type ProgressEvent } from '@/lib/spriteworks/orchestrator';
import { sfx } from '@/lib/sounds';

const STORAGE_KEY_PREFIX = 'spriteworks:';

function readKey(envName: string): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEY_PREFIX + envName) || '';
}

function writeKey(envName: string, value: string): void {
  if (typeof window === 'undefined') return;
  if (value) localStorage.setItem(STORAGE_KEY_PREFIX + envName, value);
  else localStorage.removeItem(STORAGE_KEY_PREFIX + envName);
}

async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('failed to read blob'));
    reader.readAsDataURL(blob);
  });
}

async function svgDataUrlToPng(svgDataUrl: string, size = 192): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, size, size);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => reject(new Error('failed to render SVG'));
    img.src = svgDataUrl;
  });
}

function downloadDataUrl(dataUrl: string, filename: string) {
  sfx.playClick();
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

function downloadBlob(blob: Blob, filename: string) {
  sfx.playClick();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const font = { fontFamily: 'var(--font-departure-mono)' };
const fieldClass = 'w-full rounded-md border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1.5 text-xs text-foreground outline-none focus:border-neutral-400 dark:focus:border-neutral-600';
const buttonGhost = 'rounded-md border border-neutral-200 dark:border-neutral-800 px-2 py-1.5 text-[11px] text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors';
const buttonPrimary = 'rounded-md bg-foreground px-3 py-1.5 text-[11px] text-background hover:opacity-80 disabled:opacity-30 disabled:cursor-not-allowed transition-opacity';
const sectionLabel = 'text-[10px] uppercase tracking-widest text-muted-foreground/60';

const PROVIDER_KEY_DOCS: Record<Provider, string> = {
  gemini: 'https://ai.google.dev/gemini-api/docs/api-key',
  openai: 'https://openrouter.ai/keys',
};

export function SpriteworksClient() {
  const [provider, setProvider] = useState<Provider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [tokenId, setTokenId] = useState('');
  const [chainId] = useState(360);
  const [cellSize, setCellSize] = useState<CellSize>(DEFAULT_CELL_SIZE);
  const [cols, setCols] = useState<number>(ATLAS_COLS);
  const [rows, setRows] = useState<number>(ATLAS_ROWS);
  const [presetId, setPresetId] = useState<string>(DEFAULT_PRESET_ID);
  const [userExtras, setUserExtras] = useState<string>('');
  const [customLayout, setCustomLayout] = useState<string>('');
  const [extendBust, setExtendBust] = useState(true);

  const [referenceMode, setReferenceMode] = useState<'default' | 'custom' | 'none'>('default');
  const [characterSource, setCharacterSource] = useState<'token' | 'upload'>('token');
  const [uploadedCharName, setUploadedCharName] = useState<string | null>(null);

  function applyPreset(id: string) {
    const preset = SPRITE_PRESETS.find((p) => p.id === id);
    if (!preset) return;
    setPresetId(id);
    setCols(preset.cols);
    setRows(preset.rows);
    // Preserve a user-uploaded reference across preset switches.
    if (referenceMode !== 'custom') {
      setReferenceMode(preset.defaultReferenceMode);
    }
    sfx.playSelect();
  }
  const [customReferenceDataUrl, setCustomReferenceDataUrl] = useState<string | null>(null);
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);

  const referenceFileInputRef = useRef<HTMLInputElement | null>(null);
  const characterFileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const provInfo = PROVIDERS.find((p) => p.id === provider);
    if (provInfo) setApiKey(readKey(provInfo.envKeyName));
  }, [provider]);

  function handleApiKeyChange(value: string) {
    setApiKey(value);
    const provInfo = PROVIDERS.find((p) => p.id === provider);
    if (provInfo) writeKey(provInfo.envKeyName, value);
  }

  const loadAvatar = useCallback(async (id: string) => {
    if (!id || !/^\d+$/.test(id.trim())) {
      setAvatarError('Token id must be an integer.');
      return;
    }
    setAvatarLoading(true);
    setAvatarError(null);
    setAvatarDataUrl(null);
    try {
      const res = await fetch(`/api/agent-files/${chainId}/${id.trim()}/avatar.svg`);
      if (!res.ok) {
        if (res.status === 404) throw new Error(`BOOA #${id} not found.`);
        throw new Error(`avatar fetch failed (${res.status})`);
      }
      const blob = await res.blob();
      const reader = new FileReader();
      const dataUrl: string = await new Promise((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('failed to read avatar blob'));
        reader.readAsDataURL(blob);
      });
      const isSvg = dataUrl.startsWith('data:image/svg+xml');
      const png = isSvg ? await svgDataUrlToPng(dataUrl, 192) : dataUrl;
      setAvatarDataUrl(png);
    } catch (e) {
      setAvatarError(e instanceof Error ? e.message : String(e));
    } finally {
      setAvatarLoading(false);
    }
  }, [chainId]);

  function handleCharacterUpload(file: File) {
    setAvatarError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const img = new Image();
        const dataUrl = reader.result as string;
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Image decode failed'));
          img.src = dataUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0);
        setAvatarDataUrl(canvas.toDataURL('image/png'));
        setUploadedCharName(file.name);
        setTokenId('');
      } catch (e) {
        setAvatarError(e instanceof Error ? e.message : 'Failed to load character image.');
      }
    };
    reader.readAsDataURL(file);
  }

  function handleReferenceUpload(file: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      // Re-encode to PNG so providers always receive a known mime type.
      try {
        const img = new Image();
        const dataUrl = reader.result as string;
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Image decode failed'));
          img.src = dataUrl;
        });
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(img, 0, 0);
        setCustomReferenceDataUrl(canvas.toDataURL('image/png'));
        setReferenceMode('custom');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load reference image.');
      }
    };
    reader.readAsDataURL(file);
  }

  const referenceDataUrl = useMemo<string | null>(() => {
    if (referenceMode === 'none') return null;
    if (referenceMode === 'custom' && customReferenceDataUrl) return customReferenceDataUrl;
    return DEFAULT_REFERENCE_URL;
  }, [referenceMode, customReferenceDataUrl]);

  const canRun = !!apiKey && !!avatarDataUrl && !running;

  async function handleRun() {
    if (!apiKey || !avatarDataUrl) return;
    sfx.playClick();
    setRunning(true);
    setError(null);
    setProgress([]);
    setResult(null);

    try {
      let refDataUrl: string | undefined;
      if (referenceDataUrl) {
        refDataUrl = referenceDataUrl.startsWith('data:')
          ? referenceDataUrl
          : await urlToDataUrl(referenceDataUrl);
      }

      const preset = SPRITE_PRESETS.find((p) => p.id === presetId) ?? SPRITE_PRESETS[0];
      // Honor preset rowSpec only when the grid still matches; user grid edits drop to a uniform map.
      const usingPresetGrid = preset.cols === cols && preset.rows === rows;
      const rowMap = usingPresetGrid ? rowMapFromPreset(preset) : buildGenericRowMap(cols, rows);

      const baseDescription = presetId === 'custom'
        ? customLayout.trim()
        : preset.internalPrompt.trim();
      const extras = userExtras.trim();
      const composed = [baseDescription, extras && `ADDITIONAL DETAILS:\n${extras}`]
        .filter(Boolean)
        .join('\n\n');

      const isCustomCharacter = characterSource === 'upload';
      const job: SpriteworksJob = {
        tokenId: tokenId || 'custom',
        chainId,
        avatarDataUrl,
        referenceDataUrl: refDataUrl,
        provider,
        apiKey,
        rowMap,
        settings: {
          ...DEFAULT_PIPELINE_SETTINGS,
          cellSize,
          cols,
          rows,
          paletteMode: isCustomCharacter ? 'avatar' : DEFAULT_PIPELINE_SETTINGS.paletteMode,
        },
        skipExtension: !extendBust,
        customLayoutDescription: composed || undefined,
        isCustomCharacter,
      };
      const res = await runSpriteworksJob(job, (e) => setProgress((prev) => [...prev, e]));
      setResult(res);
      sfx.playSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      sfx.playError();
    } finally {
      setRunning(false);
    }
  }

  async function handleDownloadZip() {
    if (!result) return;
    const preset = SPRITE_PRESETS.find((p) => p.id === presetId) ?? SPRITE_PRESETS[0];
    const usingPresetGrid = preset.cols === cols && preset.rows === rows;
    const rowMap = usingPresetGrid ? rowMapFromPreset(preset) : buildGenericRowMap(cols, rows);
    const job: SpriteworksJob = {
      tokenId: tokenId || 'custom',
      chainId,
      avatarDataUrl: avatarDataUrl || '',
      referenceDataUrl: referenceDataUrl ?? undefined,
      provider,
      apiKey: '',
      rowMap,
      settings: { ...DEFAULT_PIPELINE_SETTINGS, cellSize, cols, rows },
    };
    const blob = await buildResultZip(result, job);
    const stem = characterSource === 'upload' ? 'sprite-custom' : `booa-sprite-${tokenId || 'custom'}`;
    downloadBlob(blob, `${stem}.zip`);
  }

  const tokenLabel = characterSource === 'upload' ? 'custom' : tokenId || 'custom';

  return (
    <div className="p-4 md:p-8 lg:p-12" style={font}>
      <div className="w-full lg:grid lg:grid-cols-12">
        <div className="hidden lg:block lg:col-span-1" />
        <div className="lg:col-span-10">

          <div className="mb-8 max-w-2xl space-y-6">
            <Link
              href="/studio"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              style={font}
            >
              <ArrowLeft className="w-4 h-4" /> Back to Studio
            </Link>
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest">BOOA Studio</p>
              <h1 className="text-2xl sm:text-3xl text-foreground">Spriteworks</h1>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
                Animate your BOOA — or any uploaded character — into a game-ready sprite sheet. Pick a motion (idle, walk, run, jump) and every frame stays locked to the character&apos;s face, gear, and palette.
              </p>
            </div>
          </div>

          <div className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="space-y-5 text-xs">
          <div className="space-y-1.5">
            <p className={sectionLabel}>Provider</p>
            <div className="grid grid-cols-2 gap-1">
              {PROVIDERS.map((p) => {
                const active = p.id === provider;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => { sfx.playSelect(); setProvider(p.id); }}
                    title={p.description}
                    className={`px-1.5 py-1.5 text-[10px] uppercase border transition-colors ${
                      active
                        ? 'border-foreground bg-foreground text-background'
                        : 'border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900'
                    }`}
                  >
                    {p.id === 'gemini' ? 'Gemini' : 'OpenAI'}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className={sectionLabel}>API key</p>
            <div className="flex gap-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
                placeholder={provider === 'gemini' ? 'AIza…' : 'sk-or-…'}
                className={fieldClass}
              />
              <button type="button" onClick={() => { sfx.playClick(); setShowKey((v) => !v); }} className={buttonGhost} title={showKey ? 'Hide' : 'Show'}>
                {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <a
                href={PROVIDER_KEY_DOCS[provider]}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              >
                Where do I find my API key? <ExternalLink className="h-2.5 w-2.5" />
              </a>
              <span
                title={`Estimated cost: ${PROVIDERS.find((p) => p.id === provider)?.costHint || ''}\n\nBOOA Spriteworks calls the provider directly with your key. The key is read from this browser only and never sent to BOOA servers.`}
                className="inline-flex items-center justify-center w-3 h-3 border border-muted-foreground/40 text-[8px] text-muted-foreground hover:border-foreground hover:text-foreground transition-colors cursor-help"
              >
                ?
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <p className={sectionLabel}>Character</p>
            <div className="grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => {
                  sfx.playSelect();
                  setCharacterSource('token');
                  setAvatarDataUrl(null);
                  setUploadedCharName(null);
                  setAvatarError(null);
                }}
                className={`px-1.5 py-1.5 text-[10px] uppercase border transition-colors ${
                  characterSource === 'token'
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900'
                }`}
              >
                BOOA
              </button>
              <button
                type="button"
                onClick={() => {
                  sfx.playSelect();
                  setCharacterSource('upload');
                  setAvatarDataUrl(null);
                  setTokenId('');
                  setAvatarError(null);
                }}
                className={`flex items-center justify-center gap-1 px-1.5 py-1.5 text-[10px] uppercase border transition-colors ${
                  characterSource === 'upload'
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900'
                }`}
              >
                <Upload className="h-3 w-3" /> Upload
              </button>
            </div>
            {characterSource === 'token' ? (
              <div className="flex gap-1">
                <input
                  value={tokenId}
                  onChange={(e) => setTokenId(e.target.value)}
                  placeholder="0–3332"
                  inputMode="numeric"
                  className={fieldClass}
                />
                <button type="button" onClick={() => { sfx.playClick(); loadAvatar(tokenId); }} disabled={!tokenId || avatarLoading} className={buttonPrimary}>
                  {avatarLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                </button>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => { sfx.playClick(); characterFileInputRef.current?.click(); }}
                  className={`${buttonGhost} flex w-full items-center justify-center gap-1`}
                >
                  <Upload className="h-3 w-3" /> {avatarDataUrl ? 'Replace image' : 'Pick an image'}
                </button>
                <input
                  ref={characterFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleCharacterUpload(f);
                    e.target.value = '';
                  }}
                />
                {uploadedCharName && (
                  <p className="truncate text-[9px] text-muted-foreground" title={uploadedCharName}>
                    {uploadedCharName}
                  </p>
                )}
                <p className="text-[9px] text-muted-foreground">
                  PNG/JPG/WEBP/GIF. Pixel-art bust or full body works best.
                </p>
              </>
            )}
            {avatarError && <p className="text-[10px] text-red-600">{avatarError}</p>}
            {avatarDataUrl && (
              <div className="pt-1">
                <img
                  src={avatarDataUrl}
                  alt={characterSource === 'upload' ? 'uploaded character' : `BOOA #${tokenId}`}
                  className="h-16 w-16 border border-neutral-300 dark:border-neutral-700 object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <p className={sectionLabel}>Reference</p>
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => { sfx.playSelect(); setReferenceMode('default'); }}
                className={`px-1.5 py-1.5 text-[10px] uppercase border transition-colors ${
                  referenceMode === 'default'
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900'
                }`}
              >
                Default
              </button>
              <button
                type="button"
                onClick={() => { sfx.playClick(); referenceFileInputRef.current?.click(); }}
                className={`flex items-center justify-center gap-1 px-1.5 py-1.5 text-[10px] uppercase border transition-colors ${
                  referenceMode === 'custom'
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900'
                }`}
              >
                <Upload className="h-3 w-3" /> Upload
              </button>
              <button
                type="button"
                onClick={() => { sfx.playSelect(); setReferenceMode('none'); }}
                className={`flex items-center justify-center gap-1 px-1.5 py-1.5 text-[10px] uppercase border transition-colors ${
                  referenceMode === 'none'
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900'
                }`}
                title="No layout reference — AI follows your prompt only."
              >
                <Ban className="h-3 w-3" /> None
              </button>
              <input
                ref={referenceFileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/avif,image/gif"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleReferenceUpload(f);
                  e.target.value = '';
                }}
              />
            </div>
            {referenceMode === 'none' ? (
              <div className="flex h-20 w-full items-center justify-center border border-dashed border-neutral-300 dark:border-neutral-700 px-2 text-center text-[9px] uppercase tracking-widest text-muted-foreground">
                No reference — AI follows the prompt only
              </div>
            ) : (
              referenceDataUrl && (
                <img
                  src={referenceDataUrl}
                  alt="reference"
                  className="h-20 w-auto border border-neutral-300 dark:border-neutral-700 object-contain"
                  style={{ imageRendering: 'pixelated' }}
                />
              )
            )}
          </div>

          <div className="space-y-1.5">
            <p className={sectionLabel}>Preset</p>
            <select
              value={presetId}
              onChange={(e) => applyPreset(e.target.value)}
              className={fieldClass}
            >
              {SPRITE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <p className="text-[9px] text-muted-foreground">
              {SPRITE_PRESETS.find((p) => p.id === presetId)?.description}
            </p>
          </div>

          {presetId === 'custom' && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <p className={sectionLabel}>Layout description</p>
                <span className="text-[9px] text-muted-foreground/60">required</span>
              </div>
              <textarea
                value={customLayout}
                onChange={(e) => setCustomLayout(e.target.value)}
                placeholder='e.g. "Each row is a walk cycle in one of 8 directions, 8 keyframes per row."'
                rows={4}
                className={`${fieldClass} resize-y leading-snug`}
              />
              <p className="text-[9px] text-muted-foreground">
                You define the rows, frames, and motion. Per-frame detail is sent verbatim to the AI.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className={sectionLabel}>Extras</p>
              <span className="text-[9px] text-muted-foreground/60">optional</span>
            </div>
            <textarea
              value={userExtras}
              onChange={(e) => setUserExtras(e.target.value)}
              placeholder='e.g. "holding a glowing lightsaber, wearing a red cape, glowing yellow eyes"'
              rows={3}
              className={`${fieldClass} resize-y leading-snug`}
            />
            <p className="text-[9px] text-muted-foreground">
              Add gear, weapons, accessories. Animation pose details for the selected preset are handled automatically.
            </p>
          </div>

          <div className="space-y-1.5">
            <p className={sectionLabel}>Grid (cols × rows)</p>
            <div className="grid grid-cols-2 gap-1">
              <input
                type="number"
                min={MIN_GRID_DIM}
                max={MAX_GRID_DIM}
                value={cols}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (Number.isFinite(v)) setCols(Math.max(MIN_GRID_DIM, Math.min(MAX_GRID_DIM, v)));
                  if (presetId !== 'custom') setPresetId('custom');
                }}
                className={fieldClass}
                placeholder="cols"
              />
              <input
                type="number"
                min={MIN_GRID_DIM}
                max={MAX_GRID_DIM}
                value={rows}
                onChange={(e) => {
                  const v = parseInt(e.target.value, 10);
                  if (Number.isFinite(v)) setRows(Math.max(MIN_GRID_DIM, Math.min(MAX_GRID_DIM, v)));
                  if (presetId !== 'custom') setPresetId('custom');
                }}
                className={fieldClass}
                placeholder="rows"
              />
            </div>
            <p className="text-[9px] text-muted-foreground">
              Default 6×8 matches the canonical reference. Match these to your custom reference&apos;s grid if you upload one.
            </p>
          </div>

          <div className="space-y-1.5">
            <p className={sectionLabel}>Cell size</p>
            <div className="grid grid-cols-5 gap-0.5">
              {ALLOWED_CELL_SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { sfx.playSelect(); setCellSize(s); }}
                  className={`px-1 py-1 text-[10px] border transition-colors ${
                    s === cellSize
                      ? 'border-foreground bg-foreground text-background'
                      : 'border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-900'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <p className="text-[9px] text-muted-foreground">Atlas: {cellSize * cols}×{cellSize * rows} px</p>
          </div>

          <div className="space-y-1.5">
            <p className={sectionLabel}>Pre-generation</p>
            <label className="flex cursor-pointer select-none items-center gap-2 text-[10px] uppercase text-muted-foreground hover:text-foreground transition-colors">
              <input
                type="checkbox"
                checked={extendBust}
                onChange={(e) => { sfx.playToggle(e.target.checked); setExtendBust(e.target.checked); }}
                className="cursor-pointer accent-foreground"
              />
              Bust → full body
              <span
                title="If your character image is a bust portrait (head + shoulders only), one extra AI call extends it into a full body before the atlas pass. Recommended for BOOA tokens. Turn this off if you uploaded a full-body image already.\n\nCost: +1 generation per character (≈ +$0.10–0.15)."
                className="ml-auto inline-flex items-center justify-center w-3 h-3 border border-muted-foreground/40 text-[8px] hover:border-foreground hover:text-foreground transition-colors cursor-help"
              >
                ?
              </span>
            </label>
          </div>

          <button type="button" onClick={handleRun} disabled={!canRun} className={`${buttonPrimary} w-full py-2.5 text-xs uppercase`}>
            {running ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" /> Generating…
              </span>
            ) : (
              'Generate'
            )}
          </button>
          {error && (
            <div className="border border-red-300 bg-red-50 dark:border-red-900 dark:bg-red-950/30 p-2 text-[10px] text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {result && (
            <div className="space-y-1.5 border-t border-neutral-300 dark:border-neutral-700 pt-4">
              <p className={sectionLabel}>Download</p>
              <button
                type="button"
                onClick={() => downloadDataUrl(result.atlasDataUrl, `booa-${tokenLabel}-atlas.png`)}
                className={`${buttonGhost} flex w-full items-center gap-2`}
              >
                <Download className="h-3 w-3" /> atlas.png
              </button>
              <button
                type="button"
                onClick={() => downloadDataUrl(result.contactSheetDataUrl, `booa-${tokenLabel}-contact.png`)}
                className={`${buttonGhost} flex w-full items-center gap-2`}
              >
                <Download className="h-3 w-3" /> contact-sheet.png
              </button>
              <button
                type="button"
                onClick={handleDownloadZip}
                className={`${buttonPrimary} flex w-full items-center gap-2`}
              >
                <Download className="h-3 w-3" /> Download all (ZIP)
              </button>
            </div>
          )}
        </aside>

        <main className="space-y-6 text-xs">
          {progress.length > 0 && !result && (
            <div className="space-y-1 border-l border-neutral-300 dark:border-neutral-700 pl-3 text-[11px] text-neutral-600 dark:text-neutral-300">
              {progress.map((p, i) => (
                <p key={i} className="font-mono">
                  {p.stage === 'extend-start' && <>extend / {p.provider} …</>}
                  {p.stage === 'extend-done' && <>extend ✓ ({Math.round(p.bytes / 1024)} KB)</>}
                  {p.stage === 'gen-start' && (
                    <>
                      atlas / {p.provider} {p.genCols}×{p.genRows}
                      {(p.genCols !== p.outCols || p.genRows !== p.outRows) && (
                        <> → rearrange to {p.outCols}×{p.outRows}</>
                      )}{' '}
                      …
                    </>
                  )}
                  {p.stage === 'gen-done' && <>atlas ✓ ({Math.round(p.bytes / 1024)} KB)</>}
                  {p.stage === 'pipeline-start' && <>pipeline …</>}
                  {p.stage === 'pipeline-done' && <>pipeline ✓ ({p.paletteSize} colors)</>}
                  {p.stage === 'extract-start' && <>extract …</>}
                  {p.stage === 'extract-done' && <>extract ✓ ({p.frames} frames)</>}
                  {p.stage === 'gifs-start' && <>gifs …</>}
                  {p.stage === 'gifs-done' && <>gifs ✓ ({p.count})</>}
                  {p.stage === 'contact-done' && <>contact ✓</>}
                  {p.stage === 'identity-done' && <>identity ✓ ({(p.overlap * 100).toFixed(1)}%)</>}
                </p>
              ))}
            </div>
          )}

          {!result && !progress.length && (
            <p className="text-neutral-400">Pick provider, paste key, load a BOOA or upload a character, generate.</p>
          )}

          {result && (
            <>
              <section className="space-y-3">
                <p className={sectionLabel}>
                  Atlas · {cellSize * cols}×{cellSize * rows} · {result.paletteSize} colors · identity {(result.identityOverlap * 100).toFixed(1)}%
                </p>
                <img
                  src={result.atlasDataUrl}
                  alt="generated atlas"
                  className="h-auto max-w-full rounded-md border border-neutral-200 dark:border-neutral-800"
                  style={{ imageRendering: 'pixelated' }}
                />
              </section>

              {result.rowGifBlobs.length > 0 && (
                <section className="space-y-2">
                  <p className={sectionLabel}>Per-row GIFs ({result.rowGifBlobs.length})</p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {result.rowGifBlobs.map((g) => (
                      <RowGifPreview
                        key={g.state}
                        state={g.state}
                        blob={g.blob}
                        method={result.methodUsedPerRow[g.state]}
                        onDownload={() => downloadBlob(g.blob, `booa-${tokenLabel}-${g.state}.gif`)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </main>
      </div>

        </div>
      </div>
    </div>
  );
}

function RowGifPreview({
  state,
  blob,
  method,
  onDownload,
}: {
  state: string;
  blob: Blob;
  method?: string;
  onDownload: () => void;
}) {
  const [url, setUrl] = useState<string>('');
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);

  return (
    <div className="border border-neutral-300 dark:border-neutral-700 p-2">
      {url && (
        <img
          src={url}
          alt={state}
          className="mx-auto h-20 w-auto"
          style={{ imageRendering: 'pixelated' }}
        />
      )}
      <div className="mt-1 flex items-center justify-between gap-1 text-[9px] uppercase text-neutral-500">
        <span>{state.replace(/_/g, ' ')}</span>
        <button
          type="button"
          onClick={onDownload}
          title="Download"
          className="border border-neutral-300 dark:border-neutral-700 px-1.5 py-0.5 hover:bg-neutral-100 dark:hover:bg-neutral-900"
        >
          <Download className="h-2.5 w-2.5" />
        </button>
      </div>
      {method && <p className="text-[8px] text-neutral-400">{method}</p>}
    </div>
  );
}
