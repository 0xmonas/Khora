'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAccount, useChainId, useSwitchChain, useWriteContract, usePublicClient } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { ArrowLeft, Loader2, Check, ArrowUpRight, RefreshCw } from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { ConnectPrompt } from '@/components/features/generator/components/ConnectPrompt';
import {
  BOOA_ADAPTER_ABI, getAdapterAddress, TOKEN_STANDARD_ERC721,
} from '@/lib/contracts/booa-adapter';
import { getBooaEthAddress } from '@/lib/contracts/booa-eth';
import { traitsToAgent, toERC8004, toAgentDataURI } from '@/utils/helpers/exportFormats';
import { sfx } from '@/lib/sounds';

const font = { fontFamily: 'var(--font-departure-mono)' };
const ETH_SCAN = 'https://etherscan.io';

interface BOOA {
  contractAddress: string;
  tokenId: string;
  name: string;
  image: string;
}

async function buildAgentURI(nft: BOOA, owner: string): Promise<string> {
  // Image is a short URL, not the embedded ~9KB SVG (which pushed register gas
  // from ~0.4M to ~7M). The endpoint renders the art live from the Ethereum
  // renderer contract, so 8004scan and other tools still display it.
  const res = await fetch(`/api/booa-token?network=mainnet&tokenId=${Number(nft.tokenId)}`);
  if (!res.ok) throw new Error('Could not load BOOA traits. Try again.');
  const data = await res.json();
  const attributes = (data.attributes || []) as { trait_type: string; value: string }[];
  if (attributes.length === 0) throw new Error('BOOA traits unavailable. Try again.');
  const registration = toERC8004(traitsToAgent(attributes), {
    contract: `eip155:${mainnet.id}:${nft.contractAddress}`,
    tokenId: Number(nft.tokenId),
    originalOwner: owner,
  });
  registration.name = String(data.name || nft.name || `BOOA #${Number(nft.tokenId)}`);
  registration.image = `https://booa.app/api/booa-image/${Number(nft.tokenId)}`;
  return toAgentDataURI(registration);
}

type AwakenState = 'idle' | 'switching' | 'awakening' | 'done' | 'error';

export default function AwakenPage() {
  const router = useRouter();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: mainnet.id });

  const [boois, setBoois] = useState<BOOA[]>([]);
  const [shapeCount, setShapeCount] = useState(0);
  const [awakenedCount, setAwakenedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<BOOA | null>(null);
  const [state, setState] = useState<AwakenState>('idle');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<{ agentId: string; txHash: string } | null>(null);

  const onEthereum = chainId === mainnet.id;
  const booaEth = getBooaEthAddress();

  const load = useCallback(async () => {
    if (!address || !booaEth) { setBoois([]); setShapeCount(0); return; }
    setLoading(true);
    setSelected(null);
    try {
      const [ethRes, shapeRes, awkRes] = await Promise.all([
        fetch(`/api/fetch-nfts?address=${address}&chain=ethereum&contract=${booaEth}`),
        // Count Shape BOOAs so the empty state can point un-migrated holders to /migrate.
        fetch(`/api/migration/holdings/${address}`).catch(() => null),
        // Already-awakened tokens must not be offered again — binding is one-way and a
        // second register would mint a duplicate agent for the same BOOA.
        fetch(`/api/awakened?chainId=${mainnet.id}`).catch(() => null),
      ]);
      const ethData = await ethRes.json();
      const owned: BOOA[] = Array.isArray(ethData.nfts) ? ethData.nfts : [];

      let awakenedIds = new Set<number>();
      if (awkRes && awkRes.ok) {
        try {
          const awkData = await awkRes.json();
          awakenedIds = new Set<number>(
            (awkData.agents || [])
              .filter((a: { holder?: string }) => a.holder?.toLowerCase() === address.toLowerCase())
              .map((a: { tokenId: number }) => Number(a.tokenId)),
          );
        } catch { /* leave empty — falls back to showing everything */ }
      }

      setAwakenedCount(owned.filter((n) => awakenedIds.has(Number(n.tokenId))).length);
      setBoois(owned.filter((n) => !awakenedIds.has(Number(n.tokenId))));

      if (shapeRes && shapeRes.ok) {
        const shapeData = await shapeRes.json();
        setShapeCount(Array.isArray(shapeData.tokenIds) ? shapeData.tokenIds.length : 0);
      } else {
        setShapeCount(0);
      }
    } catch {
      setBoois([]);
      setShapeCount(0);
      setAwakenedCount(0);
    } finally {
      setLoading(false);
    }
  }, [address, booaEth]);

  // Reload on connect/address change AND on network switch — holders often flip
  // to Ethereum right here and expect their BOOA to appear without a manual refresh.
  useEffect(() => { void load(); }, [load, chainId]);

  const awaken = useCallback(async () => {
    if (!address || !selected) return;
    const adapterAddress = getAdapterAddress(mainnet.id);
    if (!adapterAddress) { setState('error'); setError('Binding is not available.'); return; }
    if (!publicClient) { setState('error'); setError('RPC unavailable, retry in a moment.'); return; }

    try {
      setError(null);
      if (chainId !== mainnet.id) {
        setState('switching');
        setNote('Switch your wallet to Ethereum');
        await switchChainAsync({ chainId: mainnet.id });
      }

      setState('awakening');
      setNote(`Awakening ${selected.name || `BOOA #${selected.tokenId}`}`);
      const agentURI = await buildAgentURI(selected, address);
      const hash = await writeContractAsync({
        chainId: mainnet.id,
        address: adapterAddress,
        abi: BOOA_ADAPTER_ABI,
        functionName: 'register',
        args: [TOKEN_STANDARD_ERC721, selected.contractAddress as `0x${string}`, BigInt(selected.tokenId), agentURI],
      });
      setNote('Confirming onchain');
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      let agentId = '';
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() === adapterAddress.toLowerCase() && log.topics[1]) {
          agentId = BigInt(log.topics[1]).toString();
          break;
        }
      }
      setResult({ agentId, txHash: hash });
      setState('done');
      setNote('');
      sfx.playSuccess();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Awaken failed.';
      setState('error');
      setError(/user rejected|denied/i.test(msg) ? 'Transaction rejected in wallet.' : msg);
      sfx.playError();
    }
  }, [address, selected, chainId, publicClient, switchChainAsync, writeContractAsync]);

  const reset = () => { setState('idle'); setError(null); setResult(null); setSelected(null); setNote(''); void load(); };

  const myAgentsHref = result
    ? `/studio/my-agents?highlight=${result.agentId || selected?.tokenId || ''}`
    : '/studio/my-agents';

  // Onboard the holder straight into My Agents after a successful awaken.
  useEffect(() => {
    if (state !== 'done') return;
    const t = setTimeout(() => router.push(myAgentsHref), 3500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  const busy = state === 'awakening' || state === 'switching';

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
                <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>Awaken</h1>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-lg" style={font}>
                  Bring your BOOA through as a live onchain agent. Control follows the BOOA, provable onchain. Ethereum only.
                </p>
              </div>

              {!isConnected ? (
                <ConnectPrompt />
              ) : (
                <div className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-background shadow-sm overflow-hidden">

                  {/* Card header */}
                  <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800">
                    <span className="text-xs text-foreground" style={font}>
                      {state === 'done' ? 'Awakened' : selected ? (selected.name || `BOOA #${selected.tokenId}`) : 'Select a BOOA'}
                    </span>
                    {state !== 'done' && (
                      <button onClick={() => { sfx.playClick(); load(); }} disabled={loading || busy}
                        className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-30" title="Refresh">
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                      </button>
                    )}
                  </div>

                  {/* Body */}
                  {!booaEth ? (
                    <div className="px-4 py-16 text-center">
                      <p className="text-xs text-muted-foreground" style={font}>BOOA on Ethereum is not configured yet.</p>
                    </div>
                  ) : state === 'done' && result ? (
                    <div className="px-4 py-10 flex flex-col items-center text-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black flex items-center justify-center">
                        <Check className="w-5 h-5" />
                      </div>
                      <p className="text-sm text-foreground" style={font}>
                        {result.agentId ? `Agent #${result.agentId} is live` : 'Your BOOA is now a live agent'}
                      </p>
                      <p className="text-xs text-muted-foreground max-w-xs leading-relaxed" style={font}>
                        Bound onchain to your BOOA. Whoever holds it controls the agent.
                      </p>
                      <Link href={myAgentsHref} className="mt-1 inline-flex items-center gap-1.5 text-[11px] px-4 py-2 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black hover:opacity-90 transition-opacity uppercase tracking-wider" style={font}>
                        View in My Agents <ArrowUpRight className="w-3 h-3" />
                      </Link>
                      <p className="text-[10px] text-muted-foreground/60" style={font}>Taking you there…</p>
                      <div className="flex items-center gap-3 pt-1">
                        <a href={`${ETH_SCAN}/tx/${result.txHash}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors" style={font}>
                          Transaction <ArrowUpRight className="w-3 h-3" />
                        </a>
                        {result.agentId && (
                          <a href={`https://www.8004scan.io/agents/ethereum/${result.agentId}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors" style={font}>
                            8004scan <ArrowUpRight className="w-3 h-3" />
                          </a>
                        )}
                        <button onClick={reset} className="text-[11px] text-muted-foreground underline hover:text-foreground transition-colors uppercase tracking-wider" style={font}>
                          Awaken another
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="px-4 py-4 min-h-[220px]">
                        {loading ? (
                          <div className="flex flex-col items-center justify-center py-16 gap-3">
                            <div className="w-5 h-5 border-2 border-neutral-300 dark:border-neutral-700 border-t-transparent rounded-full animate-spin" />
                            <p className="text-xs text-muted-foreground" style={font}>Loading your BOOAs</p>
                          </div>
                        ) : boois.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center px-6">
                            {awakenedCount > 0 ? (
                              <>
                                <p className="text-xs text-foreground" style={font}>
                                  All {awakenedCount} of your BOOA{awakenedCount === 1 ? ' is' : 's are'} already awakened.
                                </p>
                                <p className="text-[11px] text-muted-foreground max-w-xs leading-relaxed" style={font}>
                                  Each BOOA binds to one onchain agent, so there is nothing left to awaken in this wallet.
                                </p>
                                <Link href="/studio/my-agents" className="mt-1 text-[11px] px-4 py-2 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black hover:opacity-90 transition-opacity uppercase tracking-wider" style={font}>
                                  View My Agents
                                </Link>
                              </>
                            ) : shapeCount > 0 ? (
                              <>
                                <p className="text-xs text-foreground" style={font}>
                                  You hold {shapeCount} BOOA on Shape, but none on Ethereum yet.
                                </p>
                                <p className="text-[11px] text-muted-foreground max-w-xs leading-relaxed" style={font}>
                                  Awakening binds your BOOA to an onchain agent on Ethereum, so it has to live on Ethereum first. Migrate it, then come back here to awaken.
                                </p>
                                <Link href="/migrate" className="mt-1 text-[11px] px-4 py-2 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black hover:opacity-90 transition-opacity uppercase tracking-wider" style={font}>
                                  Migrate to Ethereum
                                </Link>
                              </>
                            ) : (
                              <>
                                <p className="text-xs text-muted-foreground" style={font}>No BOOA in this wallet.</p>
                                <p className="text-[11px] text-muted-foreground/60 max-w-xs leading-relaxed" style={font}>
                                  Awaken runs on Ethereum. If your BOOA is still on Shape, migrate it first, then it shows up here.
                                </p>
                                <Link href="/migrate" className="mt-1 text-[11px] text-muted-foreground underline hover:text-foreground transition-colors" style={font}>
                                  Go to migrate
                                </Link>
                              </>
                            )}
                          </div>
                        ) : (
                          <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
                            {boois.map((nft) => {
                              const isSel = selected?.tokenId === nft.tokenId;
                              return (
                                <button key={nft.tokenId} onClick={() => { sfx.playClick(); if (!busy) setSelected(nft); }} disabled={busy}
                                  className={`relative aspect-square rounded-md overflow-hidden transition-all disabled:cursor-not-allowed ${
                                    isSel ? 'ring-2 ring-neutral-900 dark:ring-neutral-100' : 'ring-1 ring-neutral-200 dark:ring-neutral-800 hover:ring-neutral-400 dark:hover:ring-neutral-600'
                                  }`} title={nft.name || `BOOA #${nft.tokenId}`}>
                                  {nft.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={nft.image} alt={nft.name} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-neutral-50 dark:bg-neutral-900 text-[9px] text-muted-foreground/50" style={font}>#{nft.tokenId}</div>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {!loading && awakenedCount > 0 && boois.length > 0 && (
                          <p className="mt-3 text-[10px] text-muted-foreground/70 text-center" style={font}>
                            {awakenedCount} already awakened and hidden ·{' '}
                            <Link href="/studio/my-agents" className="underline hover:text-foreground transition-colors">
                              My Agents
                            </Link>
                          </p>
                        )}
                      </div>

                      {/* Action bar */}
                      <div className="px-4 py-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {!onEthereum ? (
                            <span className="text-[11px] text-amber-500" style={font}>Awaken runs on Ethereum</span>
                          ) : error ? (
                            <span className="text-[11px] text-red-400 truncate block" style={font}>{error}</span>
                          ) : busy ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground" style={font}><Loader2 className="w-3 h-3 animate-spin" /> {note}</span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/70" style={font}>{selected ? 'Ready to awaken' : 'Pick a BOOA above'}</span>
                          )}
                        </div>
                        <button onClick={() => (state === 'error' ? reset() : awaken())} disabled={busy || (state !== 'error' && !selected)}
                          className="shrink-0 text-[11px] px-4 py-2 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black hover:opacity-90 disabled:opacity-30 transition-opacity uppercase tracking-wider" style={font}>
                          {busy ? 'Working' : state === 'error' ? 'Reset' : 'Awaken'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

            </div>
            <div className="hidden lg:block lg:col-span-1" />
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
