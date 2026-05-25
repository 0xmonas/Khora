'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useChainId, useReadContract } from 'wagmi';
import { Eye, EyeOff, ExternalLink } from 'lucide-react';
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

  const [tokenIdInput, setTokenIdInput] = useState('');
  const [selectedTokenId, setSelectedTokenId] = useState<number | null>(null);

  const [lore, setLore] = useState('');
  const [displayed, setDisplayed] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [quotaExceeded, setQuotaExceeded] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  const animRef = useRef<number | null>(null);

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

  const handleSearch = useCallback(() => {
    setError(null);
    setLore('');
    setDisplayed('');
    const id = parseInt(tokenIdInput.trim(), 10);
    if (!Number.isInteger(id) || id < 0 || id > 3332) {
      setError('Token ID must be between 0 and 3332.');
      setSelectedTokenId(null);
      return;
    }
    setSelectedTokenId(id);
  }, [tokenIdInput]);

  const animateLore = useCallback((text: string) => {
    if (animRef.current) {
      window.clearInterval(animRef.current);
      animRef.current = null;
    }
    setDisplayed('');
    let i = 0;
    const speedMs = 18;
    animRef.current = window.setInterval(() => {
      i += 1;
      setDisplayed(text.slice(0, i));
      if (i >= text.length && animRef.current) {
        window.clearInterval(animRef.current);
        animRef.current = null;
      }
    }, speedMs);
  }, []);

  useEffect(() => {
    return () => {
      if (animRef.current) window.clearInterval(animRef.current);
    };
  }, []);

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
        body: JSON.stringify({ chainId: targetChainId, tokenId: selectedTokenId }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.quotaExceeded) setQuotaExceeded(true);
        setError(data.error || 'Failed to generate lore.');
        return;
      }
      const text = data.lore || '';
      setLore(text);
      animateLore(text);
      if (data.usingOwnKey) setQuotaExceeded(true);
      if (typeof data.remaining === 'number') setRemaining(data.remaining);
    } catch {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedTokenId, isLoading, apiKey, targetChainId, animateLore]);

  const handleCopy = useCallback(() => {
    if (!lore) return;
    navigator.clipboard.writeText(lore).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [lore]);

  const isStreaming = isLoading || (lore && displayed.length < lore.length);
  const needsKey = quotaExceeded && !apiKey;

  return (
    <div className="max-w-xl mx-auto space-y-10 pb-12">
      <div className="space-y-2">
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground" style={font}>
          BOOA Token ID
        </p>
        <div className="flex items-baseline gap-3">
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={tokenIdInput}
            onChange={(e) => setTokenIdInput(e.target.value.replace(/[^0-9]/g, ''))}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
            placeholder="e.g. 1496"
            className="flex-1 bg-transparent border-0 border-b border-foreground/30 focus:border-foreground outline-none px-1 py-2 text-xl dark:text-white placeholder:text-foreground/30"
            style={font}
          />
          <button
            onClick={handleSearch}
            disabled={!tokenIdInput.trim()}
            className="text-xs uppercase tracking-wider text-foreground/70 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            style={font}
          >
            Load
          </button>
        </div>
        <p className="text-[10px] text-muted-foreground/60" style={font}>
          BOOA collection only. Any of the 3,333.
        </p>
      </div>

      {selectedTokenId !== null && (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3">
            {nftImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={nftImage}
                alt={nftName || `BOOA #${selectedTokenId}`}
                className="w-64 h-64 sm:w-80 sm:h-80"
                style={{ imageRendering: 'pixelated' }}
              />
            ) : (
              <div className="w-64 h-64 sm:w-80 sm:h-80 grid place-items-center">
                <p className="text-xs text-muted-foreground" style={font}>Loading…</p>
              </div>
            )}
            <div className="text-center space-y-0.5">
              <p className="text-sm dark:text-white" style={font}>{nftName || `BOOA #${selectedTokenId}`}</p>
              <p className="text-[10px] text-muted-foreground" style={font}>BOOA #{selectedTokenId}</p>
            </div>
          </div>

          <div className="flex justify-center">
            <button
              onClick={handleGenerate}
              disabled={isLoading || traits.length === 0 || needsKey}
              className="text-xs uppercase tracking-[0.2em] text-foreground/80 hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors py-2"
              style={font}
            >
              {isLoading ? 'Generating…' : 'Generate Lore'}
            </button>
          </div>

          {remaining !== null && remaining >= 0 && !apiKey && (
            <p className="text-[10px] text-muted-foreground/60 text-center" style={font}>
              {remaining} free generation{remaining === 1 ? '' : 's'} left today.
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500 text-center" style={font}>{error}</p>
      )}

      {(displayed || isStreaming) && (
        <div className="space-y-3">
          <p className="text-base sm:text-lg leading-relaxed dark:text-white" style={font}>
            {displayed}
            {isStreaming && <span className="blinking-cursor">|</span>}
          </p>
          {lore && !isStreaming && (
            <div className="flex justify-end">
              <button
                onClick={handleCopy}
                className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                style={font}
              >
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          )}
        </div>
      )}

      <details open={needsKey} className="pt-8 border-t border-foreground/10">
        <summary className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground cursor-pointer hover:text-foreground transition-colors" style={font}>
          {apiKey ? 'Using your Gemini key' : needsKey ? 'Add your Gemini API key to continue' : 'Bring your own Gemini key'}
        </summary>
        <div className="pt-3 space-y-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60" style={font}>API key</p>
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
          <div className="flex items-center gap-2">
            <a
              href={GEMINI_DOCS_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              style={font}
            >
              Where do I find my API key? <ExternalLink className="h-2.5 w-2.5" />
            </a>
            <span
              title="BOOA Agent Lore calls Gemini directly with your key. The key is read from this browser only and never persisted on BOOA servers."
              className="inline-flex items-center justify-center w-3 h-3 border border-muted-foreground/40 text-[8px] text-muted-foreground hover:border-foreground hover:text-foreground transition-colors cursor-help"
            >
              ?
            </span>
          </div>
        </div>
      </details>
    </div>
  );
}
