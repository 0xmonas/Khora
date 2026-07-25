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
import { LinkAgentWalletModal } from '@/components/features/my-agents/LinkAgentWalletModal';
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
  // Lazily resolved from /api/agent-registry:
  verified: boolean | null;
  agentWallet: string | null;
  services: number | null;
  skills: number | null;
  detailLoaded: boolean;
}

function Badge({ tone, children }: { tone: 'live' | 'ok' | 'muted'; children: React.ReactNode }) {
  const cls =
    tone === 'live'
      ? 'border-green-600/80 dark:border-green-500/80 text-green-700 dark:text-green-400'
      : tone === 'ok'
        ? 'border-neutral-300 dark:border-neutral-700 text-foreground'
        : 'border-neutral-200 dark:border-neutral-800 text-muted-foreground';
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 border rounded-sm text-[8px] uppercase tracking-[0.15em] ${cls}`} style={font}>
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

function Tile({ tile, booaEth, adapter, highlight, onLink }: {
  tile: AgentTile;
  booaEth: string;
  adapter: string | null;
  highlight: boolean;
  onLink: (tile: AgentTile) => void;
}) {
  const awakened = tile.agentId !== null;
  const openseaUrl = `https://opensea.io/assets/ethereum/${booaEth}/${tile.tokenId}`;
  const scanUrl = awakened ? `https://www.8004scan.io/agents/ethereum/${tile.agentId}` : null;
  const adapterUrl = adapter ? `${ETH_SCAN}/address/${adapter}` : null;
  const identUrl = `/agent/ethereum/${tile.tokenId}`;

  return (
    <div className="group block">
      {/* Art — studio card language: square, rounded-lg, hairline ring */}
      <div
        className={`relative aspect-square overflow-hidden rounded-lg bg-neutral-100 dark:bg-neutral-900 ring-1 transition-all duration-300 ${
          highlight
            ? 'ring-green-600/80 dark:ring-green-500/80'
            : 'ring-neutral-200/60 dark:ring-neutral-800 group-hover:ring-neutral-400 dark:group-hover:ring-neutral-600'
        }`}
      >
        {tile.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={tile.image} alt={tile.name} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-[10px]" style={font}>#{tile.tokenId}</div>
        )}
        <span
          className={`absolute top-2 right-2 text-[8px] uppercase tracking-[0.15em] px-1.5 py-0.5 border rounded-sm bg-background/85 backdrop-blur-sm ${
            awakened
              ? 'border-green-600/80 dark:border-green-500/80 text-green-700 dark:text-green-400'
              : 'border-neutral-300 dark:border-neutral-700 text-muted-foreground'
          }`}
          style={font}
        >
          {awakened ? 'Awakened' : 'Dormant'}
        </span>
        {highlight && (
          <span className="absolute top-2 left-2 inline-flex items-center gap-1 text-[8px] uppercase tracking-[0.15em] px-1.5 py-0.5 rounded-sm bg-green-600 text-white" style={font}>
            <Sparkles className="w-2.5 h-2.5" /> New
          </span>
        )}
      </div>

      {/* Body — text block sits outside the frame, like studio tool cards */}
      <div className="mt-3 space-y-1">
        <div className="min-w-0">
          <h3 className="text-xs text-foreground truncate" style={font}>{tile.name || `BOOA #${tile.tokenId}`}</h3>
          <p className="text-[10px] text-muted-foreground" style={font}>
            BOOA #{tile.tokenId}{awakened ? ` · agent #${tile.agentId}` : ''}
          </p>
        </div>

        {/* Badges */}
        {awakened && (tile.verified === true || tile.detailLoaded) && (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {tile.verified === true && <Badge tone="ok"><Check className="w-2 h-2" /> Verified</Badge>}
            <Badge tone={tile.walletLinked ? 'ok' : 'muted'}>
              {tile.walletLinked ? 'Wallet linked' : 'No wallet'}
            </Badge>
          </div>
        )}

        {/* Agent wallet (awakened only) */}
        {awakened && tile.detailLoaded && (
          <div className="pt-1 space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground/70" style={font}>Agent wallet</span>
              <button
                onClick={(e) => { e.stopPropagation(); onLink(tile); }}
                className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground transition-colors"
                style={font}
              >
                {tile.agentWallet ? 'Change' : 'Link'}
              </button>
            </div>
            <p className="text-[10px] text-foreground/80 truncate" style={font}>
              {tile.agentWallet ? `${tile.agentWallet.slice(0, 10)}…${tile.agentWallet.slice(-6)}` : '—'}
            </p>
            {(tile.services !== null || tile.skills !== null) && (
              <p className="text-[9px] text-muted-foreground/60" style={font}>
                {tile.services ?? 0} services · {tile.skills ?? 0} skills
              </p>
            )}
          </div>
        )}

        {/* Detail links */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 pt-1">
          <LinkChip href={openseaUrl}>OpenSea</LinkChip>
          {scanUrl && <LinkChip href={scanUrl}>8004scan</LinkChip>}
          {awakened && adapterUrl && <LinkChip href={adapterUrl}>Adapter</LinkChip>}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-1.5">
          {awakened ? (
            <>
              <Link href={identUrl} className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground transition-colors" style={font}>Ident</Link>
              <span className="text-muted-foreground/30">·</span>
              <Link href="/studio/agent-chat" className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground transition-colors" style={font}>Chat</Link>
              <span className="text-muted-foreground/30">·</span>
              <Link href="/bridge" className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground transition-colors" style={font}>Configure</Link>
            </>
          ) : (
            <Link
              href="/studio/awaken"
              className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.15em] text-foreground hover:opacity-70 transition-opacity"
              style={font}
            >
              Awaken <ArrowUpRight className="w-2.5 h-2.5" />
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
  const [linkTarget, setLinkTarget] = useState<AgentTile | null>(null);

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
            agentWallet: null,
            services: null,
            skills: null,
            detailLoaded: false,
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

  // Lazily resolve verified / agent wallet / metadata for awakened tiles (non-blocking).
  useEffect(() => {
    let cancelled = false;
    const targets = tiles.filter((t) => t.agentId !== null && !t.detailLoaded);
    if (targets.length === 0) return;
    (async () => {
      for (const t of targets) {
        try {
          const r = await fetch(`/api/agent-registry/${mainnet.id}/${t.tokenId}`);
          if (cancelled) return;
          if (!r.ok) {
            setTiles((prev) => prev.map((p) => (p.tokenId === t.tokenId ? { ...p, detailLoaded: true } : p)));
            continue;
          }
          const d = await r.json();
          if (cancelled) return;
          setTiles((prev) => prev.map((p) => (p.tokenId === t.tokenId ? {
            ...p,
            verified: !!d.verified,
            agentWallet: typeof d.agentWallet === 'string' ? d.agentWallet : null,
            walletLinked: !!d.agentWallet || p.walletLinked,
            services: Array.isArray(d.services) ? d.services.length : 0,
            skills: Array.isArray(d.skills) ? d.skills.length : 0,
            detailLoaded: true,
          } : p)));
        } catch {
          setTiles((prev) => prev.map((p) => (p.tokenId === t.tokenId ? { ...p, detailLoaded: true } : p)));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [tiles]);

  const awakenedCount = tiles.filter((t) => t.agentId !== null).length;

  return (
    <div className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-background shadow-sm overflow-hidden">

      {/* Panel header */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800">
        <span className="text-xs text-foreground" style={font}>
          {tiles.length > 0 ? `${tiles.length} BOOA · ${awakenedCount} awakened` : 'My Agents'}
        </span>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-30"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Body */}
      {loading && tiles.length === 0 ? (
        <div className="px-4 py-16 flex flex-col items-center justify-center gap-3">
          <div className="w-5 h-5 border-2 border-neutral-300 dark:border-neutral-700 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-muted-foreground" style={font}>Loading your agents</p>
        </div>
      ) : error ? (
        <div className="px-4 py-16 flex flex-col items-center justify-center gap-3 text-center">
          <p className="text-xs text-red-500" style={font}>{error}</p>
          <button onClick={() => void load()} className="text-[11px] underline text-muted-foreground hover:text-foreground" style={font}>Retry</button>
        </div>
      ) : tiles.length === 0 ? (
        <div className="px-4 py-16 flex flex-col items-center justify-center gap-3 text-center">
          <p className="text-xs text-foreground" style={font}>No BOOA on Ethereum in this wallet.</p>
          <p className="text-[11px] text-muted-foreground max-w-xs leading-relaxed" style={font}>
            Agents live on Ethereum. If your BOOA is still on Shape, migrate it first — then Awaken it into a live agent.
          </p>
          <div className="flex items-center gap-3 pt-1">
            <Link href="/migrate" className="text-[11px] text-muted-foreground underline hover:text-foreground transition-colors" style={font}>Migrate</Link>
            <Link href="/studio/awaken" className="text-[11px] px-4 py-2 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black hover:opacity-90 transition-opacity uppercase tracking-wider" style={font}>Awaken</Link>
          </div>
        </div>
      ) : (
        <div className="px-4 py-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-6">
          {tiles.map((t) => (
            <Tile
              key={t.tokenId}
              tile={t}
              booaEth={booaEth!}
              adapter={adapter}
              highlight={t.tokenId === highlightId || t.agentId === highlightId}
              onLink={setLinkTarget}
            />
          ))}
        </div>
      )}

      {linkTarget && linkTarget.agentId !== null && adapter && (
        <LinkAgentWalletModal
          open
          onClose={() => setLinkTarget(null)}
          agentId={linkTarget.agentId}
          chainId={mainnet.id}
          adapterAddress={adapter as `0x${string}`}
          currentWallet={linkTarget.agentWallet}
          onLinked={(wallet) => {
            setTiles((prev) => prev.map((p) => (p.tokenId === linkTarget.tokenId ? { ...p, agentWallet: wallet, walletLinked: true } : p)));
          }}
        />
      )}
    </div>
  );
}

export default function MyAgentsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1">
        <div className="p-4 md:p-8 lg:p-12">
          <div className="w-full lg:grid lg:grid-cols-12">
            <div className="hidden lg:block lg:col-span-1" />
            <div className="lg:col-span-10">

              <div className="space-y-3 mb-6">
                <Link href="/studio" className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors" style={font}>
                  <ArrowLeft className="w-3 h-3" /> Studio
                </Link>
                <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>My Agents</h1>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-lg" style={font}>
                  Your BOOAs and the onchain agents they carry. Awakened ones are live ERC-8004 agents you control; the rest are one step away.
                </p>
              </div>

              <HolderGate toolName="My Agents">
                <Suspense fallback={null}>
                  <MyAgentsInner />
                </Suspense>
              </HolderGate>

            </div>
            <div className="hidden lg:block lg:col-span-1" />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
