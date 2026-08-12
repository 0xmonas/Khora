'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useChainId, useReadContract } from 'wagmi';
import { useGalleryTokens } from '@/hooks/useGalleryTokens';
import { Eye, EyeOff, ExternalLink, RefreshCw, ChevronDown, Copy, Check, Download } from 'lucide-react';
import { sfx } from '@/lib/sounds';
import {
  getV2Address,
  getV2StorageAddress,
  getV2ChainId,
  BOOA_V2_ABI,
  BOOA_V2_STORAGE_ABI,
} from '@/lib/contracts/booa-v2';

const font = { fontFamily: 'var(--font-departure-mono)' };
const BYOK_STORAGE_KEY = 'booa-lore:gemini-key';
const GEMINI_DOCS_URL = 'https://aistudio.google.com/app/apikey';

const CARD_COLORS = [
  '#9F4E44',
  '#CB7E75',
  '#C9D487',
  '#9AE29B',
  '#5CAB5E',
  '#6ABFC6',
  '#887ECB',
  '#50459B',
  '#A057A3',
] as const;

function inkFor(bg: string): string {
  const r = parseInt(bg.slice(1, 3), 16);
  const g = parseInt(bg.slice(3, 5), 16);
  const b = parseInt(bg.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#000000' : '#FFFFFF';
}

interface OnChainTrait {
  trait_type: string;
  value: string;
}

function decodeTraitsHex(hex: string | undefined): OnChainTrait[] {
  try {
    if (!hex || hex === '0x') return [];
    const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
    const bytes = new Uint8Array(clean.match(/.{1,2}/g)!.map((b) => parseInt(b, 16)));
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function loadTintedLogo(ink: string): Promise<HTMLImageElement | null> {
  try {
    const res = await fetch('/booalogo.svg');
    if (!res.ok) return null;
    const svg = (await res.text())
      .replace(/\s+fill="[^"]*"/g, '')
      .replace('<svg', `<svg fill="${ink}"`);
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
    try {
      const img = new window.Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('logo'));
        img.src = url;
      });
      return img;
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  } catch {
    return null;
  }
}

function parseTokenURI(uri: string | undefined): { name: string | null; image: string | null } {
  if (!uri || !uri.startsWith('data:')) return { name: null, image: null };
  try {
    const json = JSON.parse(atob(uri.split(',')[1]));
    return { name: json.name || null, image: json.image || null };
  } catch {
    return { name: null, image: null };
  }
}

export function AgentLore() {
  const walletChainId = useChainId();
  const targetChainId = getV2ChainId(walletChainId);
  const booaAddress = getV2Address(targetChainId);
  const storageAddress = getV2StorageAddress(targetChainId);

  const [selectedTokenId, setSelectedTokenId] = useState<number | null>(null);
  const { tokens: ownedTokens, isLoading: ownedLoading } = useGalleryTokens('mine');

  const [lore, setLore] = useState('');
  const [displayed, setDisplayed] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [cardColor, setCardColor] = useState<string>(CARD_COLORS[5]);

  const animRef = useRef<number | null>(null);
  const machineRef = useRef<(() => void) | null>(null);
  const needsKeyRef = useRef(false);
  const recentLinesRef = useRef<string[]>([]);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const artRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLParagraphElement | null>(null);
  const logoRef = useRef<HTMLImageElement | null>(null);
  const ctaRef = useRef<HTMLParagraphElement | null>(null);
  const textBoxRef = useRef<HTMLDivElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const [quotePx, setQuotePx] = useState(48);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(BYOK_STORAGE_KEY) || '';
      if (stored) setApiKey(stored);
    } catch {}
  }, []);

  useEffect(() => {
    try {
      if (apiKey) localStorage.setItem(BYOK_STORAGE_KEY, apiKey);
      else localStorage.removeItem(BYOK_STORAGE_KEY);
    } catch {}
  }, [apiKey]);

  const { data: tokenURI } = useReadContract({
    address: booaAddress,
    abi: BOOA_V2_ABI,
    functionName: 'tokenURI',
    args: selectedTokenId !== null ? [BigInt(selectedTokenId)] : undefined,
    chainId: targetChainId,
    query: { enabled: selectedTokenId !== null && !!booaAddress && booaAddress.length > 2 },
  });

  const { data: traitsHex } = useReadContract({
    address: storageAddress,
    abi: BOOA_V2_STORAGE_ABI,
    functionName: 'getTraits',
    args: selectedTokenId !== null ? [BigInt(selectedTokenId)] : undefined,
    chainId: targetChainId,
    query: { enabled: selectedTokenId !== null && !!storageAddress && storageAddress.length > 2 },
  });

  const { name: nftName, image: nftImage } = parseTokenURI(tokenURI as string | undefined);
  const traits = decodeTraitsHex(traitsHex as string | undefined);

  const resolveFont = useCallback(() => {
    try {
      const probe = document.createElement('span');
      probe.style.fontFamily = 'var(--font-departure-mono)';
      probe.style.position = 'fixed';
      probe.style.visibility = 'hidden';
      probe.style.left = '-9999px';
      document.body.appendChild(probe);
      const computed = getComputedStyle(probe).fontFamily;
      document.body.removeChild(probe);
      if (computed && !computed.includes('var(')) return `${computed}, ui-monospace, monospace`;
    } catch {}
    return 'ui-monospace, monospace';
  }, []);

  const wrapLines = useCallback(
    (ctx: CanvasRenderingContext2D, text: string, px: number, family: string, maxW: number) => {
      ctx.font = `${px}px ${family}`;
      const out: string[] = [];
      let line = '';
      for (const word of text.split(/\s+/)) {
        const next = line ? `${line} ${word}` : word;
        if (ctx.measureText(next).width > maxW && line) {
          out.push(line);
          line = word;
        } else {
          line = next;
        }
      }
      if (line) out.push(line);
      return out;
    },
    [],
  );

  const fitQuote = useCallback(() => {
    const box = textBoxRef.current;
    const art = artRef.current;
    if (!box || !art || !lore) return;

    const maxW = box.getBoundingClientRect().width;
    const footerH = footerRef.current?.getBoundingClientRect().height || 0;
    const maxH = art.getBoundingClientRect().height - footerH;
    if (maxW <= 0 || maxH <= 0) return;

    const ctx = document.createElement('canvas').getContext('2d');
    if (!ctx) return;
    const family = resolveFont();

    let best = 12;
    for (let px = 96; px >= 12; px -= 1) {
      const lines = wrapLines(ctx, lore, px, family, maxW);
      if (lines.length * px * 1.375 <= maxH * 0.9) {
        best = px;
        break;
      }
    }
    setQuotePx(best);
  }, [lore, resolveFont, wrapLines]);

  const streamingNow = isLoading || (lore ? displayed.length < lore.length : false);
  useEffect(() => {
    fitQuote();
    window.addEventListener('resize', fitQuote);
    return () => window.removeEventListener('resize', fitQuote);
  }, [fitQuote, streamingNow]);

  const handleDownload = useCallback(async () => {
    if (!nftImage || !lore || selectedTokenId === null) return;

    const card = cardRef.current;
    const art = artRef.current;
    const textEl = textRef.current;
    if (!card || !art || !textEl) return;

    const cardCss = getComputedStyle(card);
    const textCss = getComputedStyle(textEl);
    const cardW = card.getBoundingClientRect().width;
    if (!cardW) return;

    const W = 1600;
    const k = W / cardW;
    const PAD = parseFloat(cardCss.paddingLeft) * k;
    const GAP = parseFloat(cardCss.columnGap || '0') * k;
    const ART = art.getBoundingClientRect().width * k;
    const RIGHT_X = PAD + ART + GAP;
    const RIGHT_W = W - PAD * 2 - ART - GAP;
    const family = resolveFont();

    const artwork = new window.Image();
    artwork.decoding = 'sync';
    try {
      await new Promise<void>((resolve, reject) => {
        artwork.onload = () => resolve();
        artwork.onerror = () => reject(new Error('artwork'));
        artwork.src = nftImage;
      });
    } catch {
      setError('Could not render the artwork for export.');
      return;
    }

    const measure = document.createElement('canvas').getContext('2d');
    if (!measure) return;
    const fontPx = parseFloat(textCss.fontSize) * k;
    const lineHeight = parseFloat(textCss.lineHeight) * k;
    measure.font = `${fontPx}px ${family}`;

    const maxWidth = RIGHT_W;
    const lines: string[] = [];
    let line = '';
    for (const word of lore.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (measure.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);

    const ink = inkFor(cardColor);
    const logoEl = logoRef.current;
    const ctaEl = ctaRef.current;
    const LOGO_H = (logoEl?.getBoundingClientRect().height || 28) * k;
    const LOGO_W = LOGO_H * (98 / 28);
    const ctaPx = (ctaEl ? parseFloat(getComputedStyle(ctaEl).fontSize) : 14) * k;
    const footerGap = ctaEl ? parseFloat(getComputedStyle(ctaEl).marginTop || '8') * k : 8 * k;
    const footerPad = 24 * k;

    const logo = await loadTintedLogo(ink);

    const footerBlock = footerPad + LOGO_H + footerGap + ctaPx;
    const H = Math.round((W * 9) / 16);
    const contentH = H - PAD * 2;

    const textAreaH = contentH - footerBlock;
    const textTop = PAD + (textAreaH - lines.length * lineHeight) / 2;
    const ctaTop = PAD + contentH - ctaPx;
    const footerTop = ctaTop - footerGap - LOGO_H;
    const CENTER_X = RIGHT_X + RIGHT_W / 2;

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = cardColor;
    ctx.fillRect(0, 0, W, H);

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(artwork, PAD, PAD + (contentH - ART) / 2, ART, ART);

    ctx.fillStyle = ink;
    ctx.font = `${fontPx}px ${family}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';
    lines.forEach((text, i) => {
      ctx.fillText(text, CENTER_X, textTop + i * lineHeight);
    });

    if (logo) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(logo, CENTER_X - LOGO_W / 2, footerTop, LOGO_W, LOGO_H);
    }

    ctx.fillStyle = ink;
    ctx.globalAlpha = 0.75;
    ctx.font = `${ctaPx}px ${family}`;
    ctx.fillText('booa.app   @booanft', CENTER_X, ctaTop);
    ctx.globalAlpha = 1;

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `booa-${selectedTokenId}-lore.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');
    sfx.playClick();
  }, [cardColor, lore, nftImage, resolveFont, selectedTokenId]);

  const stopMachine = useCallback(() => {
    if (machineRef.current) {
      machineRef.current();
      machineRef.current = null;
    }
  }, []);

  const animateLore = useCallback((text: string) => {
    if (animRef.current) {
      window.clearInterval(animRef.current);
      animRef.current = null;
    }
    setDisplayed('');
    stopMachine();
    machineRef.current = sfx.startMachine();
    let i = 0;
    const speedMs = 45;
    animRef.current = window.setInterval(() => {
      i += 1;
      setDisplayed(text.slice(0, i));
      if (i >= text.length && animRef.current) {
        window.clearInterval(animRef.current);
        animRef.current = null;
        stopMachine();
      }
    }, speedMs);
  }, [stopMachine]);

  useEffect(() => {
    return () => {
      if (animRef.current) window.clearInterval(animRef.current);
      stopMachine();
    };
  }, [stopMachine]);

  const handleGenerate = useCallback(async () => {
    if (selectedTokenId === null || isLoading) return;
    setError(null);
    setLore('');
    setDisplayed('');
    setIsLoading(true);

    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (apiKey) headers['x-gemini-key'] = apiKey;

      const res = await fetch('/api/agent-lore/describe', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          chainId: targetChainId,
          tokenId: selectedTokenId,
          previousLines: recentLinesRef.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.quotaExceeded) setQuotaExceeded(true);
        setError(data.error || 'Failed to generate lore.');
        return;
      }
      const text = data.lore || '';
      setLore(text);
      recentLinesRef.current = [...recentLinesRef.current, text].slice(-8);
      animateLore(text);
      if (data.usingOwnKey) setQuotaExceeded(true);
      if (typeof data.remaining === 'number') setRemaining(data.remaining);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedTokenId, isLoading, apiKey, targetChainId, animateLore]);

  useEffect(() => {
    setError(null);
    setLore('');
    setDisplayed('');
    setRemaining(null);
    setQuotaExceeded(false);
  }, [selectedTokenId]);

  const handleCopy = useCallback(() => {
    if (!lore) return;
    navigator.clipboard.writeText(lore).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [lore]);

  const isStreaming = isLoading || (lore && displayed.length < lore.length);
  const outOfFree = quotaExceeded || remaining === 0;
  const needsKey = outOfFree && !apiKey;
  const showKeyPanel = needsKey || !!apiKey;
  needsKeyRef.current = needsKey;
  const ink = inkFor(cardColor);
  const selected = ownedTokens.find((t) => Number(t.tokenId) === selectedTokenId);

  return (
    <div className="max-w-4xl mx-auto space-y-3">
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-background overflow-hidden shadow-sm">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800">
          <div className="relative">
            <button
              onClick={() => setPickerOpen((v) => !v)}
              disabled={ownedTokens.length === 0}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-40 transition-colors"
              style={font}
            >
              {selected?.svg && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={`data:image/svg+xml,${encodeURIComponent(selected.svg)}`}
                  alt=""
                  width={22}
                  height={22}
                  className="rounded"
                  style={{ imageRendering: 'pixelated' }}
                />
              )}
              <span className="truncate max-w-[180px]">
                {ownedLoading
                  ? 'Loading…'
                  : ownedTokens.length === 0
                    ? 'No BOOAs'
                    : selected
                      ? selected.name
                      : 'Select a BOOA'}
              </span>
              <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            </button>

            {pickerOpen && ownedTokens.length > 0 && (
              <div className="absolute top-full left-0 mt-1 z-50 w-60 max-h-52 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-700 bg-background shadow-lg chat-scrollbar">
                {ownedTokens.map((t) => {
                  const id = Number(t.tokenId);
                  return (
                    <button
                      key={t.tokenId.toString()}
                      onClick={() => { setSelectedTokenId(id); setPickerOpen(false); sfx.playSelect(); }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors ${
                        id === selectedTokenId ? 'bg-neutral-100 dark:bg-neutral-800' : ''
                      }`}
                      style={font}
                    >
                      {t.svg && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={`data:image/svg+xml,${encodeURIComponent(t.svg)}`}
                          alt=""
                          width={18}
                          height={18}
                          className="rounded flex-shrink-0"
                          style={{ imageRendering: 'pixelated' }}
                        />
                      )}
                      <span className="truncate">{t.name}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {remaining === 0 && !apiKey && (
              <span className="text-[10px] text-muted-foreground/70" style={font}>
                spoken today
              </span>
            )}
            <button
              onClick={handleGenerate}
              disabled={isLoading || selectedTokenId === null || traits.length === 0 || needsKey}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-muted-foreground/80 hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              style={font}
              title={lore ? 'Regenerate' : 'Generate'}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Generating' : lore ? 'Regenerate' : 'Generate'}
            </button>
          </div>
        </div>

        <div className="p-4">
          {selectedTokenId === null ? (
            <div className="aspect-[16/9] grid place-items-center">
              <p className="text-xs text-muted-foreground/60" style={font}>
                Pick a BOOA to hear it speak.
              </p>
            </div>
          ) : (
            <div ref={cardRef} style={{ backgroundColor: cardColor }} className="p-6 flex gap-6 items-center aspect-[16/9]">
              <div ref={artRef} className="h-full aspect-square shrink-0 self-center">
                {nftImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={nftImage}
                    alt={nftName || `BOOA #${selectedTokenId}`}
                    className="h-full w-full"
                    style={{ imageRendering: 'pixelated' }}
                  />
                ) : (
                  <div className="h-full w-full grid place-items-center">
                    <p className="text-xs" style={{ ...font, color: ink, opacity: 0.6 }}>Loading…</p>
                  </div>
                )}
              </div>

              <div className="flex-1 flex flex-col min-w-0 h-full">
                <div ref={textBoxRef} className="flex-1 grid place-items-center">
                  <p
                    ref={textRef}
                    className="leading-snug text-center"
                    style={{ ...font, color: ink, fontSize: `${quotePx}px` }}
                  >
                    {displayed}
                    {isStreaming && <span className="blinking-cursor">|</span>}
                  </p>
                </div>

                {lore && (
                  <div
                    ref={footerRef}
                    className={`space-y-1.5 flex flex-col items-center transition-opacity ${isStreaming ? 'opacity-0' : 'opacity-100'}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      ref={logoRef}
                      src="/booalogo.svg"
                      alt="BOOA"
                      className="h-5 w-auto"
                      style={{ filter: ink === '#000000' ? 'brightness(0)' : 'brightness(0) invert(1)' }}
                    />
                    <p ref={ctaRef} className="text-[11px]" style={{ ...font, color: ink, opacity: 0.75 }}>
                      booa.app   @booanft
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {selectedTokenId !== null && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-neutral-100 dark:border-neutral-800">
            <div className="flex items-center gap-1.5">
              {CARD_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => { setCardColor(c); sfx.playSelect(); }}
                  aria-label={`Card colour ${c}`}
                  className={`h-4 w-4 rounded-sm transition-transform ${cardColor === c ? 'ring-1 ring-foreground scale-110' : 'hover:scale-110'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>

            {lore && !isStreaming && (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleCopy}
                  className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                  title={copied ? 'Copied' : 'Copy text'}
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                {nftImage && (
                  <button
                    onClick={handleDownload}
                    className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                    title="Download PNG"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs text-red-500 text-center" style={font}>{error}</p>
      )}

      {showKeyPanel && (
        <details open={needsKey} className="rounded-lg border border-neutral-200 dark:border-neutral-800 px-4 py-2.5">
          <summary className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground cursor-pointer hover:text-foreground transition-colors" style={font}>
            {apiKey ? 'Using your Gemini key' : 'Add your Gemini API key to continue'}
          </summary>
          <div className="pt-3 space-y-2">
            <div className="flex gap-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIza…"
                className="flex-1 bg-transparent border-0 border-b border-foreground/30 focus:border-foreground outline-none px-1 py-1.5 text-sm dark:text-white placeholder:text-foreground/30"
                style={font}
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="px-2 text-muted-foreground hover:text-foreground transition-colors"
                title={showKey ? 'Hide' : 'Show'}
              >
                {showKey ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </button>
            </div>
            <a
              href={GEMINI_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              style={font}
            >
              Where do I find my API key? <ExternalLink className="h-2.5 w-2.5" />
            </a>
          </div>
        </details>
      )}
    </div>
  );
}
