'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useAccount } from 'wagmi';
import { ArrowLeft, ArrowUpRight, Check, RefreshCw, Sparkles } from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { HolderGate } from '@/components/features/studio/HolderGate';
import { getBooaEthAddress } from '@/lib/contracts/booa-eth';
import { getAdapterAddress } from '@/lib/contracts/booa-adapter';
import { mainnet } from 'wagmi/chains';

const font = { fontFamily: 'var(--font-departure-mono)' };
const ETH_SCAN = 'https://etherscan.io';

interface OwnedBooa {
  tokenId: number;
  name: string;
  image: string;
}

interface AwakenedRow {
  tokenId: number;
  agentId: number;
  walletLinked: boolean;
}

interface AgentTile {
  tokenId: number;
  name: string;
  image: string;
  agentId: number | null;      // null = not awakened yet
  walletLinked: boolean;
  verified: boolean | null;    // lazily resolved
}

function Badge({ tone, children }: { tone: 'live' | 'ok' | 'muted'; children: React.ReactNode }) {
  const cls =
    tone === 'live'
      ? 'border-green-600/50 text-green-600 dark:text-green-500'
      : tone === 'ok'
        ? 'border-neutral-400 dark:border-neutral-600 text-foreground'
        : 'border-neutral-300 dark:border-neutral-700 text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 border rounded-sm text-[9px] uppercase tracking-wider ${cls}`} style={font}>
      {children}
    </span>
  );
}

function LinkChip({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      style={font}
    >
      {children}
      <ArrowUpRight className="w-2.5 h-2.5" />
    </a>
  );
}

function Tile({ tile, booaEth, adapter, highlight }: {
  tile: AgentTile;
  booaEth: string;
  adapter: string | null;
  highlight: boolean;
}) {
  const awakened = tile.agentId !== null;
  const openseaUrl = `https://opensea.io/assets/ethereum/${booaEth}/${tile.tokenId}`;
  const scanUrl = awakened ? `https://www.8004scan.io/agents/ethereum/${tile.agentId}` : null;
  const adapterUrl = adapter ? `${ETH_SCAN}/address/${adapter}` : null;
  const identUrl = `/agent/ethereum/${tile.tokenId}`;

  return (
    <div
      className={`relative flex flex-col border-2 rounded-md overflow-hidden bg-background transition-shadow ${
        highlight
          ? 'border-green-600 shadow-[0_0_0_1px_rgba(22,163,74,0.5),0_0_24px_rgba(22,163,74,0.25)]'
          : 'border-neutral-700 dark:border-neutral-200'
      }`}
    >
      {/* Art */}
      <div className="relative aspect-square bg-neutral-100 dark:bg-neutral-900">
        {tile.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tile.image} alt={tile.name} className="w-full h-full object-contain" style={{ imageRendering: 'pixelated' }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs" style={font}>#{tile.tokenId}</div>
        )}
        {highlight && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 bg-green-600 text-white rounded-sm text-[9px] uppercase tracking-wider" style={font}>
            <Sparkles className="w-3 h-3" /> Just awakened
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex flex-col gap-2 p-3">
        <div className="min-w-0">
          <p className="text-sm text-foreground truncate" style={font}>{tile.name || `BOOA #${tile.tokenId}`}</p>
          <p className="text-[10px] text-muted-foreground" style={font}>
            BOOA #{tile.tokenId}{awakened ? ` · agent #${tile.agentId}` : ''}
          </p>
        </div>

        {/* Badges */}
        <div className="flex flex-wrap gap-1">
          {awakened ? (
            <Badge tone="live"><Check className="w-2.5 h-2.5" /> Awakened</Badge>
          ) : (
            <Badge tone="muted">Not awakened</Badge>
          )}
          {awakened && tile.verified === true && <Badge tone="ok">Verified</Badge>}
          {awakened && (
            <Badge tone={tile.walletLinked ? 'ok' : 'muted'}>
              {tile.walletLinked ? 'Wallet linked' : 'No agent wallet'}
            </Badge>
          )}
        </div>

        {/* Detail links */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5">
          <LinkChip href={openseaUrl}>OpenSea</LinkChip>
          {scanUrl && <LinkChip href={scanUrl}>8004scan</LinkChip>}
          {awakened && adapterUrl && <LinkChip href={adapterUrl}>Adapter</LinkChip>}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-1.5 pt-1">
          {awakened ? (
            <>
              <Link href={identUrl} className="flex-1 min-w-[72px] text-center text-[10px] px-2 py-1.5 border border-neutral-700 dark:border-neutral-200 rounded-sm uppercase tracking-wider hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors" style={font}>
                Ident
              </Link>
              <Link href="/studio/agent-chat" className="flex-1 min-w-[72px] text-center text-[10px] px-2 py-1.5 border border-neutral-700 dark:border-neutral-200 rounded-sm uppercase tracking-wider hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors" style={font}>
                Chat
              </Link>
              <Link href="/bridge" className="flex-1 min-w-[72px] text-center text-[10px] px-2 py-1.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black rounded-sm uppercase tracking-wider hover:opacity-90 transition-opacity" style={font}>
                Configure
              </Link>
            </>
          ) : (
            <Link href={`/studio/awaken`} className="flex-1 text-center text-[10px] px-2 py-1.5 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black rounded-sm uppercase tracking-wider hover:opacity-90 transition-opacity" style={font}>
              Awaken this BOOA
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

function MyAgentsInner() {
  const { address } = useAccount();
  const searchParams = useSearchParams();
  const highlightId = Number(searchParams.get('highlight') || '') || null;

  const booaEth = getBooaEthAddress();
  const adapter = getAdapterAddress(mainnet.id);

  const [tiles, setTiles] = useState<AgentTile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!address || !booaEth) { setTiles([]); return; }
    setLoading(true);
    setError(null);
    try {
      const [nftsRes, awkRes] = await Promise.all([
        fetch(`/api/fetch-nfts?address=${address}&chain=ethereum&contract=${booaEth}`),
        fetch(`/api/awakened?chainId=${mainnet.id}`),
      ]);

      const nftsJson = nftsRes.ok ? await nftsRes.json() : { nfts: [] };
      const owned: OwnedBooa[] = (nftsJson.nfts || []).map((n: { tokenId: string; name?: string; image?: string }) => ({
        tokenId: Number(n.tokenId),
        name: n.name || '',
        image: n.image || `/api/booa-image/${Number(n.tokenId)}`,
      }));

      // Awakened rows scoped to this holder (public list filtered client-side).
      const awkJson = awkRes.ok ? await awkRes.json() : { agents: [] };
      const mine = new Map<number, AwakenedRow>();
      for (const r of (awkJson.agents || awkJson.awakened || [])) {
        if (typeof r?.holder === 'string' && r.holder.toLowerCase() === address.toLowerCase()) {
          mine.set(Number(r.tokenId), { tokenId: Number(r.tokenId), agentId: Number(r.agentId), walletLinked: !!r.walletLinked });
        }
      }

      const merged: AgentTile[] = owned
        .map((b) => {
          const a = mine.get(b.tokenId);
          return {
            tokenId: b.tokenId,
            name: b.name,
            image: b.image,
            agentId: a ? a.agentId : null,
            walletLinked: a ? a.walletLinked : false,
            verified: null,
          };
        })
        // Awakened first, then by tokenId.
        .sort((x, y) => (Number(y.agentId !== null) - Number(x.agentId !== null)) || (x.tokenId - y.tokenId));

      setTiles(merged);
    } catch {
      setError('Could not load your agents. Try again in a moment.');
    } finally {
      setLoading(false);
    }
  }, [address, booaEth]);

  useEffect(() => { void load(); }, [load]);

  // Lazily resolve `verified` for awakened tiles (non-blocking).
  useEffect(() => {
    let cancelled = false;
    const targets = tiles.filter((t) => t.agentId !== null && t.verified === null);
    if (targets.length === 0) return;
    (async () => {
      for (const t of targets) {
        try {
          const r = await fetch(`/api/agent-registry/${mainnet.id}/${t.tokenId}`);
          if (!r.ok) continue;
          const d = await r.json();
          if (cancelled) return;
          setTiles((prev) => prev.map((p) => (p.tokenId === t.tokenId ? { ...p, verified: !!d.verified } : p)));
        } catch { /* leave verified null */ }
      }
    })();
    return () => { cancelled = true; };
  }, [tiles]);

  const awakenedCount = tiles.filter((t) => t.agentId !== null).length;

  return (
    <div className="max-w-6xl mx-auto px-4 md:px-8 py-8 space-y-8">
      <Link href="/studio" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors" style={font}>
        <ArrowLeft className="w-4 h-4" /> Back to Studio
      </Link>

      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="space-y-2">
          <p className="text-[10px] text-muted-foreground/60 uppercase tracking-widest" style={font}>BOOA Studio</p>
          <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>My Agents</h1>
          <p className="text-sm text-muted-foreground leading-relaxed max-w-xl" style={font}>
            Your BOOAs and their onchain agents. Awakened ones are live ERC-8004 agents you control; the rest are one step away.
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1.5 border border-neutral-700 dark:border-neutral-200 rounded-md uppercase tracking-wider hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors disabled:opacity-50"
          style={font}
        >
          <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {tiles.length > 0 && (
        <p className="text-[11px] text-muted-foreground" style={font}>
          {tiles.length} BOOA · {awakenedCount} awakened
        </p>
      )}

      {loading && tiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3">
          <div className="w-5 h-5 border-2 border-neutral-300 dark:border-neutral-700 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-muted-foreground" style={font}>Loading your agents</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center">
          <p className="text-xs text-red-500" style={font}>{error}</p>
          <button onClick={() => void load()} className="text-[11px] underline text-muted-foreground hover:text-foreground" style={font}>Retry</button>
        </div>
      ) : tiles.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 gap-3 text-center px-6">
          <p className="text-sm text-foreground" style={font}>No BOOA on Ethereum in this wallet.</p>
          <p className="text-[11px] text-muted-foreground max-w-sm leading-relaxed" style={font}>
            Agents live on Ethereum. If your BOOA is still on Shape, migrate it first — then Awaken it into a live agent.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <Link href="/migrate" className="text-[11px] px-4 py-2 border border-neutral-700 dark:border-neutral-200 rounded-md uppercase tracking-wider hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors" style={font}>Migrate</Link>
            <Link href="/studio/awaken" className="text-[11px] px-4 py-2 bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black rounded-md uppercase tracking-wider hover:opacity-90 transition-opacity" style={font}>Awaken</Link>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {tiles.map((t) => (
            <Tile key={t.tokenId} tile={t} booaEth={booaEth!} adapter={adapter} highlight={t.tokenId === highlightId || t.agentId === highlightId} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MyAgentsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <HolderGate toolName="My Agents">
          <Suspense fallback={null}>
            <MyAgentsInner />
          </Suspense>
        </HolderGate>
      </main>
      <Footer />
    </div>
  );
}
