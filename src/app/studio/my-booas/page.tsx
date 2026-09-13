'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useAccount, useChainId, useSwitchChain, useWriteContract, usePublicClient, useReadContract } from 'wagmi';
import { mainnet } from 'wagmi/chains';
import { ArrowLeft, Loader2, Check, ArrowUpRight, RefreshCw, AlertTriangle, RotateCcw } from 'lucide-react';
import { Header } from '@/components/layouts/Header';
import { Footer } from '@/components/layouts/Footer';
import { ConnectPrompt } from '@/components/features/generator/components/ConnectPrompt';
import { getBooaEthAddress } from '@/lib/contracts/booa-eth';
import { BOOA_CONFIG_ABI, LIMITS, getBooaConfigAddress, vibeError } from '@/lib/contracts/booa-config';
import { BOOA_PERSONALITY, BOOA_BOUNDARIES, PERSONALITY_LIST, BOUNDARY_LIST, type BooaCategory } from '@/lib/booa-taxonomy';
import { OASF_SKILLS, OASF_DOMAINS } from '@/lib/oasf-taxonomy';
import { BOOA_PALETTES, recolorSvg } from '@/lib/booa-palettes';
import { sfx } from '@/lib/sounds';
import { TokenDetail } from '@/components/features/booa/TokenDetail';

const font = { fontFamily: 'var(--font-departure-mono)' };
const ETH_SCAN = 'https://etherscan.io';

interface BOOA { contractAddress: string; tokenId: string; name: string; image: string }
interface Agent { name?: string; vibe?: string; personality?: string[]; boundaries?: string[]; skills?: string[]; domains?: string[] }

const SKILL_LIST = OASF_SKILLS.flatMap((c) => c.items.map((i) => i.label));
const DOMAIN_LIST = OASF_DOMAINS.flatMap((c) => c.items.map((i) => i.label));
const SKILL_CATS: BooaCategory[] = OASF_SKILLS.map((c) => ({ label: c.label, items: c.items.map((i) => i.label) }));
const DOMAIN_CATS: BooaCategory[] = OASF_DOMAINS.map((c) => ({ label: c.label, items: c.items.map((i) => i.label) }));

const toIdx = (list: string[], picked: string[]) =>
  picked.map((p) => list.indexOf(p)).filter((i) => i >= 0).sort((a, b) => a - b);
const fromIdx = (list: string[], idx: readonly number[]) => idx.map((i) => list[i]).filter(Boolean);

interface Form { palette: number; vibe: string; personality: string[]; boundaries: string[]; skills: string[]; domains: string[] }

type Step = 'idle' | 'switching' | 'saving' | 'done' | 'error';

function PickList({ title, cats, max, picked, onChange }: {
  title: string; cats: BooaCategory[]; max: number; picked: string[]; onChange: (v: string[]) => void;
}) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const lq = q.toLowerCase();
  const toggle = (item: string) => {
    sfx.playClick();
    if (picked.includes(item)) return onChange(picked.filter((p) => p !== item));
    if (picked.length >= max) return;
    onChange([...picked, item]);
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground" style={font}>{title}</span>
        <span className="text-[10px] text-muted-foreground/60" style={font}>{picked.length}/{max}</span>
      </div>
      {picked.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {picked.map((p) => (
            <button key={p} onClick={() => toggle(p)} className="text-[10px] px-2 py-0.5 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black hover:opacity-80" style={font}>
              {p} ×
            </button>
          ))}
        </div>
      )}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search"
        className="w-full text-[11px] px-2 py-1.5 rounded-md border border-neutral-200 dark:border-neutral-800 bg-transparent outline-none focus:border-neutral-400 dark:focus:border-neutral-600" style={font} />
      <div className="max-h-44 overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800 divide-y divide-neutral-100 dark:divide-neutral-800">
        {cats.map((c) => {
          const items = lq ? c.items.filter((i) => i.toLowerCase().includes(lq)) : c.items;
          if (items.length === 0) return null;
          const isOpen = !!lq || open === c.label;
          return (
            <div key={c.label}>
              <button onClick={() => setOpen(isOpen && !lq ? null : c.label)} className="w-full text-left text-[10px] px-2 py-1.5 text-muted-foreground hover:text-foreground" style={font}>
                {c.label} <span className="opacity-50">({items.length})</span>
              </button>
              {isOpen && (
                <div className="flex flex-wrap gap-1 px-2 pb-2">
                  {items.map((i) => {
                    const on = picked.includes(i);
                    return (
                      <button key={i} onClick={() => toggle(i)} disabled={!on && picked.length >= max}
                        className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors disabled:opacity-30 ${on ? 'border-neutral-900 dark:border-neutral-100 text-foreground' : 'border-neutral-200 dark:border-neutral-800 text-muted-foreground hover:border-neutral-400 dark:hover:border-neutral-600'}`} style={font}>
                        {i}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function MyBooasPage() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient({ chainId: mainnet.id });

  const [boois, setBoois] = useState<BOOA[]>([]);
  const [shapeCount, setShapeCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<BOOA | null>(null);
  const [svg, setSvg] = useState('');
  const [agent, setAgent] = useState<Agent | null>(null);

  const [palette, setPalette] = useState(0);
  const [vibe, setVibe] = useState('');
  const [personality, setPersonality] = useState<string[]>([]);
  const [boundaries, setBoundaries] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [domains, setDomains] = useState<string[]>([]);

  const [baseline, setBaseline] = useState<Form | null>(null);
  const [initFor, setInitFor] = useState<string | null>(null);
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [txHash, setTxHash] = useState<string | null>(null);

  const booaEth = getBooaEthAddress();
  const configAddress = getBooaConfigAddress();
  const onEthereum = chainId === mainnet.id;
  const busy = step === 'saving' || step === 'switching';
  const vibeErr = vibeError(vibe);
  const vibeBytes = new TextEncoder().encode(vibe).length;

  const { data: cfg, refetch: refetchCfg } = useReadContract({
    address: configAddress ?? undefined,
    abi: BOOA_CONFIG_ABI,
    functionName: 'getConfig',
    args: selected ? [BigInt(selected.tokenId)] : undefined,
    chainId: mainnet.id,
    query: { enabled: !!configAddress && !!selected },
  });
  const customized = !!cfg && cfg[1] === true;
  const cfgReady = !configAddress || cfg !== undefined;

  const form: Form = useMemo(() => ({ palette, vibe, personality, boundaries, skills, domains }), [palette, vibe, personality, boundaries, skills, domains]);
  const dirty = !!baseline && JSON.stringify(form) !== JSON.stringify(baseline);
  const applyForm = (f: Form) => {
    setPalette(f.palette); setVibe(f.vibe); setPersonality(f.personality);
    setBoundaries(f.boundaries); setSkills(f.skills); setDomains(f.domains);
  };

  const load = useCallback(async () => {
    if (!address || !booaEth) { setBoois([]); setShapeCount(0); return; }
    setLoading(true);
    setSelected(null);
    try {
      const [ethRes, shapeRes] = await Promise.all([
        fetch(`/api/fetch-nfts?address=${address}&chain=ethereum&contract=${booaEth}`),
        fetch(`/api/migration/holdings/${address}`).catch(() => null),
      ]);
      const ethData = await ethRes.json();
      const owned: BOOA[] = Array.isArray(ethData.nfts) ? ethData.nfts : [];
      setBoois(owned);
      if (shapeRes && shapeRes.ok) {
        const shapeData = await shapeRes.json();
        setShapeCount(Array.isArray(shapeData.tokenIds) ? shapeData.tokenIds.length : 0);
      } else setShapeCount(0);
      const want = new URLSearchParams(window.location.search).get('token');
      const pre = want ? owned.find((n) => n.tokenId === want) : null;
      if (pre) setSelected(pre);
    } catch {
      setBoois([]); setShapeCount(0);
    } finally {
      setLoading(false);
    }
  }, [address, booaEth]);

  useEffect(() => { void load(); }, [load, chainId]);

  useEffect(() => {
    if (!selected) { setSvg(''); setAgent(null); return; }
    const id = Number(selected.tokenId);
    let alive = true;
    setSvg(''); setAgent(null); setStep('idle'); setError(null); setTxHash(null);
    Promise.all([
      fetch(`/api/agent-files/1/${id}/avatar.svg`).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
      fetch(`/api/agent-files/1/${id}/agent.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([s, a]: [string, Agent | null]) => {
      if (!alive) return;
      setSvg(s);
      setAgent(a);
    });
    setInitFor(null); setBaseline(null);
    return () => { alive = false; };
  }, [selected]);

  const mintForm = useCallback((a: Agent | null): Form => ({
    palette: 0,
    vibe: a?.vibe || '',
    personality: (a?.personality || []).filter((p) => PERSONALITY_LIST.includes(p)).slice(0, LIMITS.personality),
    boundaries: (a?.boundaries || []).filter((p) => BOUNDARY_LIST.includes(p)).slice(0, LIMITS.boundaries),
    skills: (a?.skills || []).filter((p) => SKILL_LIST.includes(p)).slice(0, LIMITS.skills),
    domains: (a?.domains || []).filter((p) => DOMAIN_LIST.includes(p)).slice(0, LIMITS.domains),
  }), []);

  useEffect(() => {
    if (!selected || !agent || !cfgReady || initFor === selected.tokenId) return;
    const mint = mintForm(agent);
    let f = mint;
    if (customized && cfg) {
      const o = cfg[0];
      f = {
        palette: o.palette,
        vibe: o.vibe || mint.vibe,
        personality: o.personality.length ? fromIdx(PERSONALITY_LIST, o.personality) : mint.personality,
        boundaries: o.boundaries.length ? fromIdx(BOUNDARY_LIST, o.boundaries) : mint.boundaries,
        skills: o.skills.length ? fromIdx(SKILL_LIST, o.skills) : mint.skills,
        domains: o.domains.length ? fromIdx(DOMAIN_LIST, o.domains) : mint.domains,
      };
    }
    applyForm(f); setBaseline(f); setInitFor(selected.tokenId);
  }, [selected, agent, cfg, cfgReady, customized, initFor, mintForm]);

  const previewSvg = useMemo(
    () => (svg ? (palette === 0 ? svg : recolorSvg(svg, BOOA_PALETTES[palette].colors)) : null),
    [svg, palette],
  );

  const save = useCallback(async () => {
    if (!address || !selected || !configAddress || !publicClient || vibeErr) return;
    try {
      setError(null);
      if (chainId !== mainnet.id) {
        setStep('switching'); setNote('Switch your wallet to Ethereum');
        await switchChainAsync({ chainId: mainnet.id });
      }
      setStep('saving'); setNote(`Saving ${selected.name || `BOOA #${selected.tokenId}`}`);
      const hash = await writeContractAsync({
        chainId: mainnet.id, address: configAddress, abi: BOOA_CONFIG_ABI, functionName: 'setConfig',
        args: [BigInt(selected.tokenId), {
          version: 1, palette,
          vibe: vibe === (agent?.vibe || '') ? '' : vibe,
          personality: toIdx(PERSONALITY_LIST, personality),
          boundaries: toIdx(BOUNDARY_LIST, boundaries),
          skills: toIdx(SKILL_LIST, skills),
          domains: toIdx(DOMAIN_LIST, domains),
        }],
      });
      setNote('Confirming onchain');
      await publicClient.waitForTransactionReceipt({ hash });
      setBaseline(form);
      void refetchCfg();
      setTxHash(hash); setStep('done'); setNote('');
      sfx.playSuccess();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Save failed.';
      setStep('error');
      setError(/user rejected|denied/i.test(msg) ? 'Transaction rejected in wallet.' : msg);
      sfx.playError();
    }
  }, [address, selected, configAddress, publicClient, vibeErr, chainId, switchChainAsync, writeContractAsync, palette, vibe, agent, personality, boundaries, skills, domains, form, refetchCfg]);

  const restore = useCallback(async () => {
    if (!address || !selected || !configAddress || !publicClient) return;
    try {
      setError(null);
      if (chainId !== mainnet.id) {
        setStep('switching'); setNote('Switch your wallet to Ethereum');
        await switchChainAsync({ chainId: mainnet.id });
      }
      setStep('saving'); setNote('Restoring the original');
      const hash = await writeContractAsync({
        chainId: mainnet.id, address: configAddress, abi: BOOA_CONFIG_ABI, functionName: 'clearConfig',
        args: [BigInt(selected.tokenId)],
      });
      setNote('Confirming onchain');
      await publicClient.waitForTransactionReceipt({ hash });
      const mint = mintForm(agent);
      applyForm(mint); setBaseline(mint);
      void refetchCfg();
      setTxHash(hash); setStep('done'); setNote('');
      sfx.playSuccess();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Restore failed.';
      setStep('error');
      setError(/user rejected|denied/i.test(msg) ? 'Transaction rejected in wallet.' : msg);
      sfx.playError();
    }
  }, [address, selected, configAddress, publicClient, chainId, switchChainAsync, writeContractAsync, agent, mintForm, refetchCfg]);

  const discard = () => { if (baseline) { sfx.playClick(); applyForm(baseline); } };
  const reset = () => { setStep('idle'); setError(null); setTxHash(null); setNote(''); };

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
                <h1 className="text-2xl sm:text-3xl text-foreground" style={font}>My BOOAs</h1>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-lg" style={font}>
                  Your BOOA, your words. Rewrite what it says and how it looks, onchain. The art and name never change. Ethereum only.
                </p>
              </div>

              {!isConnected ? (
                <ConnectPrompt />
              ) : (
                <div className="w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-background shadow-sm overflow-hidden">

                  <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800">
                    <span className="text-xs text-foreground" style={font}>
                      {selected ? (selected.name || `BOOA #${selected.tokenId}`) : boois.length > 0 ? `${boois.length} BOOA · select one` : 'My BOOAs'}
                    </span>
                    <div className="flex items-center gap-2">
                      {selected && (
                        <button onClick={() => { sfx.playClick(); setSelected(null); }} disabled={busy} className="text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30" style={font}>
                          All
                        </button>
                      )}
                      <button onClick={() => { sfx.playClick(); load(); }} disabled={loading || busy}
                        className="p-1.5 rounded-md text-muted-foreground/60 hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors disabled:opacity-30" title="Refresh">
                        <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                      </button>
                    </div>
                  </div>

                  {!booaEth ? (
                    <div className="px-4 py-16 text-center">
                      <p className="text-xs text-muted-foreground" style={font}>BOOA on Ethereum is not configured yet.</p>
                    </div>
                  ) : step === 'done' && txHash ? (
                    <div className="px-4 py-10 flex flex-col items-center text-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black flex items-center justify-center">
                        <Check className="w-5 h-5" />
                      </div>
                      <p className="text-sm text-foreground" style={font}>Saved onchain</p>
                      <p className="text-xs text-muted-foreground max-w-xs leading-relaxed" style={font}>
                        Marketplaces refresh on their own schedule. Your BOOA already renders the new metadata.
                      </p>
                      <div className="flex items-center gap-3 pt-1">
                        <a href={`${ETH_SCAN}/tx/${txHash}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors" style={font}>
                          Transaction <ArrowUpRight className="w-3 h-3" />
                        </a>
                        <button onClick={reset} className="text-[11px] text-muted-foreground underline hover:text-foreground transition-colors uppercase tracking-wider" style={font}>
                          Edit again
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
                            {shapeCount > 0 ? (
                              <>
                                <p className="text-xs text-foreground" style={font}>You hold {shapeCount} BOOA on Shape, but none on Ethereum yet.</p>
                                <p className="text-[11px] text-muted-foreground max-w-xs leading-relaxed" style={font}>Configuration lives on Ethereum. Migrate first, then come back here.</p>
                                <Link href="/migrate" className="mt-1 text-[11px] px-4 py-2 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black hover:opacity-90 transition-opacity uppercase tracking-wider" style={font}>Migrate to Ethereum</Link>
                              </>
                            ) : (
                              <>
                                <p className="text-xs text-muted-foreground" style={font}>No BOOA in this wallet.</p>
                                <Link href="/booa/gallery" className="mt-1 text-[11px] text-muted-foreground underline hover:text-foreground transition-colors" style={font}>Browse the collection</Link>
                              </>
                            )}
                          </div>
                        ) : !selected ? (
                          <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
                            {boois.map((nft) => (
                              <button key={nft.tokenId} onClick={() => { sfx.playClick(); setSelected(nft); }}
                                className="relative aspect-square rounded-md overflow-hidden transition-all ring-1 ring-neutral-200 dark:ring-neutral-800 hover:ring-neutral-400 dark:hover:ring-neutral-600"
                                title={nft.name || `BOOA #${nft.tokenId}`}>
                                {nft.image ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={nft.image} alt={nft.name} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-neutral-50 dark:bg-neutral-900 text-[9px] text-muted-foreground/50" style={font}>#{nft.tokenId}</div>
                                )}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <TokenDetail
                            token={{ tokenId: BigInt(selected.tokenId), svg: previewSvg, name: selected.name, isOwned: true }}
                            chainId={mainnet.id}
                            configureLink={false}
                          >
                            <div className="pt-5 border-t border-neutral-100 dark:border-neutral-800 space-y-5">
                              <div className="flex items-center justify-between gap-3">
                                <p className="text-[10px] uppercase tracking-wider text-foreground" style={font}>
                                  Configure
                                  <span className={`ml-2 normal-case tracking-normal ${dirty ? 'text-amber-500' : customized ? 'text-foreground/70' : 'text-muted-foreground/60'}`}>
                                    · {dirty ? 'unsaved changes' : customized ? 'customized onchain' : 'original'}
                                  </span>
                                </p>
                                {customized && (
                                  <button onClick={restore} disabled={busy}
                                    className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider px-2 py-1 rounded-md border border-neutral-200 dark:border-neutral-800 text-muted-foreground hover:border-neutral-400 dark:hover:border-neutral-600 hover:text-foreground transition-colors disabled:opacity-30" style={font}>
                                    <RotateCcw className="w-3 h-3" /> Restore original
                                  </button>
                                )}
                              </div>
                              <div className="space-y-1.5">
                                <span className="text-[10px] uppercase tracking-wider text-muted-foreground" style={font}>Palette</span>
                                <div className="flex flex-wrap gap-1">
                                  {BOOA_PALETTES.map((p, i) => (
                                    <button key={p.name} onClick={() => { sfx.playClick(); setPalette(i); }}
                                      className={`text-[10px] px-2 py-0.5 rounded-md border transition-colors ${palette === i ? 'border-neutral-900 dark:border-neutral-100 text-foreground' : 'border-neutral-200 dark:border-neutral-800 text-muted-foreground hover:border-neutral-400 dark:hover:border-neutral-600'}`} style={font}>
                                      {p.name}
                                    </button>
                                  ))}
                                </div>
                                <p className="text-[10px] text-muted-foreground/60 leading-relaxed" style={font}>
                                  Pixels never change, only the colours they point at. C64 is always the original. Preview above.
                                </p>
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground" style={font}>Vibe · how it talks</span>
                                  <span className={`text-[10px] ${vibeErr ? 'text-red-400' : 'text-muted-foreground/60'}`} style={font}>{vibeBytes}/{LIMITS.vibeBytes}</span>
                                </div>
                                <textarea value={vibe} onChange={(e) => setVibe(e.target.value)} rows={3}
                                  className={`w-full text-[11px] px-2 py-1.5 rounded-md border bg-transparent outline-none resize-none ${vibeErr ? 'border-red-400' : 'border-neutral-200 dark:border-neutral-800 focus:border-neutral-400 dark:focus:border-neutral-600'}`} style={font} />
                                <div className="flex items-start gap-2 rounded-md border border-amber-400/50 bg-amber-400/10 px-2.5 py-2">
                                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                                  <p className="text-[10px] text-amber-700 dark:text-amber-300 leading-relaxed" style={font}>
                                    Free text goes onchain permanently and publicly. It cannot be deleted by anyone, including us. You are responsible for what you write.
                                  </p>
                                </div>
                                {vibeErr && <p className="text-[10px] text-red-400" style={font}>{vibeErr}</p>}
                              </div>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <PickList title="Personality" cats={BOOA_PERSONALITY} max={LIMITS.personality} picked={personality} onChange={setPersonality} />
                                <PickList title="Boundaries" cats={BOOA_BOUNDARIES} max={LIMITS.boundaries} picked={boundaries} onChange={setBoundaries} />
                                <PickList title="Skills (OASF)" cats={SKILL_CATS} max={LIMITS.skills} picked={skills} onChange={setSkills} />
                                <PickList title="Domains (OASF)" cats={DOMAIN_CATS} max={LIMITS.domains} picked={domains} onChange={setDomains} />
                              </div>
                            </div>
                          </TokenDetail>
                        )}
                      </div>

                      <div className="px-4 py-3 border-t border-neutral-100 dark:border-neutral-800 flex items-center justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          {!configAddress ? (
                            <span className="text-[11px] text-amber-500" style={font}>Onchain saving arrives with the Configure contract. Preview works now.</span>
                          ) : !onEthereum ? (
                            <span className="text-[11px] text-amber-500" style={font}>Configure runs on Ethereum</span>
                          ) : error ? (
                            <span className="text-[11px] text-red-400 truncate block" style={font}>{error}</span>
                          ) : busy ? (
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground" style={font}><Loader2 className="w-3 h-3 animate-spin" /> {note}</span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/70" style={font}>
                              {!selected ? 'Pick a BOOA above' : dirty ? 'Gas only, no fee. Editable any time.' : customized ? 'Saved onchain. Restore original any time.' : 'Nothing changed yet.'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {dirty && !busy && (
                            <button onClick={discard} className="text-[11px] px-3 py-2 rounded-md border border-neutral-200 dark:border-neutral-800 text-muted-foreground hover:text-foreground hover:border-neutral-400 dark:hover:border-neutral-600 transition-colors uppercase tracking-wider" style={font}>
                              Discard
                            </button>
                          )}
                          <button onClick={() => (step === 'error' ? reset() : save())} disabled={busy || !selected || !configAddress || !!vibeErr || (step !== 'error' && !dirty)}
                            className="text-[11px] px-4 py-2 rounded-md bg-neutral-900 dark:bg-neutral-100 text-white dark:text-black hover:opacity-90 disabled:opacity-30 transition-opacity uppercase tracking-wider" style={font}>
                            {busy ? 'Working' : step === 'error' ? 'Reset' : 'Save onchain'}
                          </button>
                        </div>
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
