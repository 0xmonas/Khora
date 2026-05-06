'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Upload, Download, Search, Image as ImageIcon, Eye, EyeOff } from 'lucide-react';
import {
  ALLOWED_CELL_SIZES,
  DEFAULT_CELL_SIZE,
  DEFAULT_PIPELINE_SETTINGS,
  DEFAULT_REFERENCE_URL,
  DEFAULT_ROW_MAP,
  PROVIDERS,
  type CellSize,
  type PipelineResult,
  type Provider,
  type SpriteShopJob,
} from '@/lib/sprite-shop/types';
import { runSpriteShopJob, buildResultZip, type ProgressEvent } from '@/lib/sprite-shop/orchestrator';

const font = { fontFamily: 'var(--font-departure-mono)' };
const buttonClass = 'border-2 border-neutral-700 dark:border-neutral-200 transition-colors disabled:opacity-45 disabled:cursor-not-allowed';

const STORAGE_KEY_PREFIX = 'sprite-shop:';

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

// Convert SVG dataURL → PNG dataURL by drawing on canvas at native resolution.
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

export function SpriteShopClient() {
  // Form state
  const [provider, setProvider] = useState<Provider>('gemini');
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [tokenId, setTokenId] = useState('');
  const [chainId] = useState(360);
  const [cellSize, setCellSize] = useState<CellSize>(DEFAULT_CELL_SIZE);
  const [referenceMode, setReferenceMode] = useState<'default' | 'custom'>('default');
  const [customReferenceDataUrl, setCustomReferenceDataUrl] = useState<string | null>(null);
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  // Run state
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ProgressEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PipelineResult | null>(null);

  const referenceFileInputRef = useRef<HTMLInputElement | null>(null);

  // Load saved API key when provider changes
  useEffect(() => {
    const provInfo = PROVIDERS.find((p) => p.id === provider);
    if (provInfo) setApiKey(readKey(provInfo.envKeyName));
  }, [provider]);

  function handleApiKeyChange(value: string) {
    setApiKey(value);
    const provInfo = PROVIDERS.find((p) => p.id === provider);
    if (provInfo) writeKey(provInfo.envKeyName, value);
  }

  // Load BOOA avatar from /api/agent-files when token id changes
  const loadAvatar = useCallback(async (id: string) => {
    if (!id || !/^\d+$/.test(id.trim())) {
      setAvatarError('Token id must be an integer (0–3332).');
      return;
    }
    setAvatarLoading(true);
    setAvatarError(null);
    setAvatarDataUrl(null);
    try {
      const res = await fetch(`/api/agent-files/${chainId}/${id.trim()}/avatar`);
      if (!res.ok) {
        if (res.status === 404) throw new Error(`BOOA #${id} not found on chain ${chainId}.`);
        throw new Error(`avatar fetch failed (${res.status})`);
      }
      const blob = await res.blob();
      const reader = new FileReader();
      const dataUrl: string = await new Promise((resolve, reject) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error('failed to read avatar blob'));
        reader.readAsDataURL(blob);
      });
      // The endpoint returns SVG. Rasterize to PNG so the AI gets pixel data.
      const isSvg = dataUrl.startsWith('data:image/svg+xml');
      const png = isSvg ? await svgDataUrlToPng(dataUrl, 192) : dataUrl;
      setAvatarDataUrl(png);
    } catch (e) {
      setAvatarError(e instanceof Error ? e.message : String(e));
    } finally {
      setAvatarLoading(false);
    }
  }, [chainId]);

  function handleReferenceUpload(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      setCustomReferenceDataUrl(reader.result as string);
      setReferenceMode('custom');
    };
    reader.readAsDataURL(file);
  }

  const referenceDataUrl = useMemo(() => {
    return referenceMode === 'custom' && customReferenceDataUrl
      ? customReferenceDataUrl
      : DEFAULT_REFERENCE_URL;
  }, [referenceMode, customReferenceDataUrl]);

  const canRun = !!apiKey && !!avatarDataUrl && !running;
  const providerInfo = PROVIDERS.find((p) => p.id === provider);

  async function handleRun() {
    if (!apiKey || !avatarDataUrl) return;
    setRunning(true);
    setError(null);
    setProgress([]);
    setResult(null);

    try {
      // Resolve reference to a data URL if user picked default (URL → fetch)
      const refDataUrl = referenceDataUrl.startsWith('data:')
        ? referenceDataUrl
        : await urlToDataUrl(referenceDataUrl);

      const job: SpriteShopJob = {
        tokenId: tokenId || 'custom',
        chainId,
        avatarDataUrl,
        referenceDataUrl: refDataUrl,
        provider,
        apiKey,
        rowMap: DEFAULT_ROW_MAP,
        settings: { ...DEFAULT_PIPELINE_SETTINGS, cellSize },
      };

      const res = await runSpriteShopJob(job, (e) => {
        setProgress((prev) => [...prev, e]);
      });
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  }

  async function handleDownloadZip() {
    if (!result) return;
    const job: SpriteShopJob = {
      tokenId: tokenId || 'custom',
      chainId,
      avatarDataUrl: avatarDataUrl || '',
      referenceDataUrl,
      provider,
      apiKey: '',
      rowMap: DEFAULT_ROW_MAP,
      settings: { ...DEFAULT_PIPELINE_SETTINGS, cellSize },
    };
    const blob = await buildResultZip(result, job);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `booa-sprite-${tokenId || 'custom'}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 lg:py-12" style={font}>
      <div className="mb-8">
        <h1 className="text-2xl text-foreground sm:text-3xl">Sprite Shop</h1>
        <p className="mt-2 max-w-2xl text-xs text-neutral-500 sm:text-sm">
          Generate a game-ready 6×8 sprite atlas from any BOOA. Bring your own AI key (Gemini, OpenAI, or
          Replicate). Default reference is a top-down RPG layout; you can upload your own. Output: clean atlas,
          per-row GIFs, contact sheet, ZIP export.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
        {/* ── Form column ─────────────────────────────────────── */}
        <section className="space-y-5">
          {/* Provider */}
          <div className="border-2 border-neutral-700 dark:border-neutral-200 p-3">
            <p className="text-[10px] uppercase text-neutral-500">Provider (BYOK)</p>
            <div className="mt-2 grid grid-cols-3 gap-1">
              {PROVIDERS.map((p) => {
                const active = p.id === provider;
                const disabled = p.id === 'replicate'; // v1 limitation
                return (
                  <button
                    key={p.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => setProvider(p.id)}
                    className={`${buttonClass} px-2 py-2 text-[10px] uppercase ${
                      active ? 'bg-foreground text-background' : 'bg-background text-foreground hover:bg-neutral-200 dark:hover:bg-neutral-800'
                    }`}
                  >
                    {p.label}
                    {disabled && <div className="mt-0.5 text-[8px] normal-case text-neutral-500">soon</div>}
                  </button>
                );
              })}
            </div>
            {providerInfo && (
              <p className="mt-2 text-[10px] text-neutral-500">
                {providerInfo.description} — {providerInfo.costHint}
              </p>
            )}
            <div className="mt-3">
              <label className="text-[10px] uppercase text-neutral-500">API key</label>
              <div className="mt-1 flex gap-1">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  placeholder={provider === 'gemini' ? 'AIza…' : provider === 'openai' ? 'sk-…' : 'r8_…'}
                  className="flex-1 border-2 border-neutral-700 dark:border-neutral-200 bg-background px-2 py-1.5 text-xs outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className={`${buttonClass} px-2`}
                  title={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              <p className="mt-1 text-[9px] text-neutral-500">
                Stored in browser localStorage. Never sent to BOOA backend.
              </p>
            </div>
          </div>

          {/* BOOA token */}
          <div className="border-2 border-neutral-700 dark:border-neutral-200 p-3">
            <p className="text-[10px] uppercase text-neutral-500">BOOA Token</p>
            <div className="mt-2 flex gap-1">
              <input
                value={tokenId}
                onChange={(e) => setTokenId(e.target.value)}
                placeholder="Token ID (0–3332)"
                inputMode="numeric"
                className="flex-1 border-2 border-neutral-700 dark:border-neutral-200 bg-background px-2 py-1.5 text-xs outline-none"
              />
              <button
                type="button"
                onClick={() => loadAvatar(tokenId)}
                disabled={!tokenId || avatarLoading}
                className={`${buttonClass} flex items-center gap-1 bg-foreground px-3 py-1.5 text-[10px] uppercase text-background hover:bg-neutral-700 dark:hover:bg-neutral-300`}
              >
                {avatarLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
                Load
              </button>
            </div>
            {avatarError && <p className="mt-2 text-[10px] text-red-600">{avatarError}</p>}
            {avatarDataUrl && (
              <div className="mt-3">
                <p className="text-[10px] uppercase text-neutral-500">Loaded avatar</p>
                <div className="mt-1 inline-block border-2 border-neutral-700 dark:border-neutral-200 bg-neutral-100 dark:bg-neutral-900 p-1">
                  <img
                    src={avatarDataUrl}
                    alt={`BOOA #${tokenId}`}
                    className="h-24 w-24 object-contain"
                    style={{ imageRendering: 'pixelated' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Reference */}
          <div className="border-2 border-neutral-700 dark:border-neutral-200 p-3">
            <p className="text-[10px] uppercase text-neutral-500">Reference Layout</p>
            <div className="mt-2 grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setReferenceMode('default')}
                className={`${buttonClass} px-2 py-2 text-[10px] uppercase ${
                  referenceMode === 'default'
                    ? 'bg-foreground text-background'
                    : 'bg-background text-foreground hover:bg-neutral-200 dark:hover:bg-neutral-800'
                }`}
              >
                Default
              </button>
              <button
                type="button"
                onClick={() => referenceFileInputRef.current?.click()}
                className={`${buttonClass} flex items-center justify-center gap-1 px-2 py-2 text-[10px] uppercase ${
                  referenceMode === 'custom'
                    ? 'bg-foreground text-background'
                    : 'bg-background text-foreground hover:bg-neutral-200 dark:hover:bg-neutral-800'
                }`}
              >
                <Upload className="h-3 w-3" /> Upload
              </button>
              <input
                ref={referenceFileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleReferenceUpload(f);
                  e.target.value = '';
                }}
              />
            </div>
            <div className="mt-3 inline-block border-2 border-neutral-700 dark:border-neutral-200 bg-neutral-100 dark:bg-neutral-900 p-1">
              <img
                src={referenceDataUrl}
                alt="reference"
                className="h-32 w-auto object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>
            <p className="mt-2 text-[9px] text-neutral-500">
              The reference contributes layout + pose vocabulary only — never identity.
            </p>
          </div>

          {/* Settings */}
          <div className="border-2 border-neutral-700 dark:border-neutral-200 p-3">
            <p className="text-[10px] uppercase text-neutral-500">Cell Size</p>
            <div className="mt-2 grid grid-cols-5 gap-1">
              {ALLOWED_CELL_SIZES.map((s) => {
                const active = s === cellSize;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setCellSize(s)}
                    className={`${buttonClass} px-1 py-1.5 text-[10px] ${
                      active ? 'bg-foreground text-background' : 'bg-background text-foreground hover:bg-neutral-200 dark:hover:bg-neutral-800'
                    }`}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[9px] text-neutral-500">
              Atlas: {cellSize * 6}×{cellSize * 8} px. 96 = canonical reference geometry.
            </p>
          </div>

          {/* Run */}
          <button
            type="button"
            onClick={handleRun}
            disabled={!canRun}
            className={`${buttonClass} w-full bg-foreground py-3 text-sm uppercase text-background hover:bg-neutral-700 dark:hover:bg-neutral-300`}
          >
            {running ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Generating…
              </span>
            ) : (
              'Generate Sprite Atlas'
            )}
          </button>
          {error && (
            <div className="border-2 border-red-700 bg-red-100 dark:bg-red-950 p-2 text-[10px] text-red-700 dark:text-red-300">
              {error}
            </div>
          )}
        </section>

        {/* ── Result column ──────────────────────────────────── */}
        <section className="space-y-5">
          {progress.length > 0 && !result && (
            <div className="border-2 border-neutral-700 dark:border-neutral-200 p-3">
              <p className="text-[10px] uppercase text-neutral-500">Progress</p>
              <ul className="mt-2 space-y-1 text-[10px] text-neutral-600 dark:text-neutral-300">
                {progress.map((p, i) => (
                  <li key={i}>
                    {p.stage === 'gen-start' && <>→ AI generation started ({p.provider})…</>}
                    {p.stage === 'gen-done' && <>✓ AI returned ({Math.round(p.bytes / 1024)} KB)</>}
                    {p.stage === 'pipeline-start' && <>→ Chroma key + palette snap…</>}
                    {p.stage === 'pipeline-done' && <>✓ Pipeline ({p.paletteSize} colors)</>}
                    {p.stage === 'extract-start' && <>→ Per-row component extraction…</>}
                    {p.stage === 'extract-done' && <>✓ {p.frames} frames extracted</>}
                    {p.stage === 'gifs-start' && <>→ Rendering per-row GIFs…</>}
                    {p.stage === 'gifs-done' && <>✓ {p.count} GIFs</>}
                    {p.stage === 'contact-done' && <>✓ Contact sheet</>}
                    {p.stage === 'identity-done' && <>✓ Identity overlap: {(p.overlap * 100).toFixed(1)}%</>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result && (
            <>
              <div className="border-2 border-neutral-700 dark:border-neutral-200 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <p className="text-[10px] uppercase text-neutral-500">
                    Atlas — {cellSize * 6}×{cellSize * 8} px · {result.paletteSize} colors · identity {(result.identityOverlap * 100).toFixed(1)}%
                  </p>
                  <button
                    type="button"
                    onClick={handleDownloadZip}
                    className={`${buttonClass} flex items-center gap-1 bg-foreground px-3 py-1.5 text-[10px] uppercase text-background hover:bg-neutral-700 dark:hover:bg-neutral-300`}
                  >
                    <Download className="h-3 w-3" /> ZIP
                  </button>
                </div>
                <img
                  src={result.atlasDataUrl}
                  alt="generated atlas"
                  className="h-auto w-full max-w-full"
                  style={{ imageRendering: 'pixelated' }}
                />
              </div>

              {result.rowGifBlobs.length > 0 && (
                <div className="border-2 border-neutral-700 dark:border-neutral-200 p-3">
                  <p className="text-[10px] uppercase text-neutral-500">Per-row GIFs</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {result.rowGifBlobs.map((g) => (
                      <RowGifPreview key={g.state} state={g.state} blob={g.blob} method={result.methodUsedPerRow[g.state]} />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {!result && !progress.length && (
            <div className="border-2 border-neutral-700 dark:border-neutral-200 bg-neutral-50 dark:bg-neutral-900 p-6 text-center text-xs text-neutral-500">
              <ImageIcon className="mx-auto mb-2 h-8 w-8 opacity-40" />
              Pick a provider, paste your API key, load a BOOA, click Generate.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function RowGifPreview({ state, blob, method }: { state: string; blob: Blob; method?: string }) {
  const [url, setUrl] = useState<string>('');
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return (
    <div className="border border-neutral-700 dark:border-neutral-200 bg-neutral-100 dark:bg-neutral-900 p-2 text-center">
      {url && (
        <img
          src={url}
          alt={state}
          className="mx-auto h-24 w-auto"
          style={{ imageRendering: 'pixelated' }}
        />
      )}
      <p className="mt-1 text-[9px] uppercase text-neutral-500">{state.replace(/_/g, ' ')}</p>
      {method && <p className="text-[8px] text-neutral-400">via {method}</p>}
    </div>
  );
}
