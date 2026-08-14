'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { ChevronDown, Unplug } from 'lucide-react';
import { mainnet } from 'wagmi/chains';
import { useAuth } from '@/hooks/useAuth';
import { getBooaEthAddress } from '@/lib/contracts/booa-eth';
import { ConsoleConnection, ProbeError, loadConnection, clearConnection, probeInstance } from './connection';
import { ConsoleMeta, ConsoleAgent } from './types';
import { ConnectPanel } from './ConnectPanel';
import { ChatPanel } from './ChatPanel';
import { LogsPanel } from './LogsPanel';
import { DataPanel } from './DataPanel';

const font = { fontFamily: 'var(--font-departure-mono)' };

type Tab = 'chat' | 'logs' | 'data';

export function AgentConsole() {
  const { address, isConnected } = useAuth();
  const booaEth = getBooaEthAddress();

  const [agents, setAgents] = useState<ConsoleAgent[]>([]);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [selectedTokenId, setSelectedTokenId] = useState<number | null>(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [registryLoading, setRegistryLoading] = useState(false);

  const [conn, setConn] = useState<ConsoleConnection | null>(null);
  const [meta, setMeta] = useState<ConsoleMeta | null>(null);
  const [probing, setProbing] = useState(false);
  const [probeError, setProbeError] = useState<ProbeError | null>(null);
  const [ownershipLost, setOwnershipLost] = useState(false);
  const [tab, setTab] = useState<Tab>('chat');

  const selected = agents.find((a) => a.tokenId === selectedTokenId) || null;

  useEffect(() => {
    if (!address || !isConnected || !booaEth) {
      setAgents([]);
      return;
    }
    setAgentsLoading(true);
    Promise.all([
      fetch(`/api/fetch-nfts?address=${address}&chain=ethereum&contract=${booaEth}`),
      fetch(`/api/awakened?chainId=${mainnet.id}`),
    ])
      .then(async ([nftsRes, awkRes]) => {
        const nftsJson = nftsRes.ok ? await nftsRes.json() : { nfts: [] };
        const awkJson = awkRes.ok ? await awkRes.json() : { agents: [] };
        const mine = new Map<number, number>();
        for (const r of (awkJson.agents || [])) {
          if (typeof r?.holder === 'string' && r.holder.toLowerCase() === address.toLowerCase()) {
            mine.set(Number(r.tokenId), Number(r.agentId));
          }
        }
        const list: ConsoleAgent[] = (nftsJson.nfts || [])
          .map((n: { tokenId: string; name?: string; image?: string }) => ({
            tokenId: Number(n.tokenId),
            name: n.name || `BOOA #${n.tokenId}`,
            image: n.image || `/api/booa-image/${Number(n.tokenId)}`,
            agentId: mine.get(Number(n.tokenId)) ?? null,
            bound: null,
            controller: null,
            agentWallet: null,
          }))
          .sort((x: ConsoleAgent, y: ConsoleAgent) =>
            (Number(y.agentId !== null) - Number(x.agentId !== null)) || (x.tokenId - y.tokenId));
        setAgents(list);
      })
      .catch(() => setAgents([]))
      .finally(() => setAgentsLoading(false));
  }, [address, isConnected, booaEth]);

  const checkOwnership = useCallback(async (tokenId: number): Promise<boolean> => {
    try {
      const res = await fetch(`/api/agent-registry/${mainnet.id}/${tokenId}`);
      if (!res.ok) return false;
      const d = await res.json();
      const bound = !!d.bound;
      const controller = typeof d.controller === 'string' ? d.controller.toLowerCase() : null;
      const agentWallet = typeof d.agentWallet === 'string' ? d.agentWallet : null;
      setAgents((prev) => prev.map((a) => (a.tokenId === tokenId ? { ...a, bound, controller, agentWallet } : a)));
      return bound && !!address && controller === address.toLowerCase();
    } catch {
      return false;
    }
  }, [address]);

  useEffect(() => {
    setConn(null);
    setMeta(null);
    setProbeError(null);
    setOwnershipLost(false);
    if (selectedTokenId === null) return;
    let cancelled = false;

    (async () => {
      setRegistryLoading(true);
      const ok = await checkOwnership(selectedTokenId);
      if (cancelled) return;
      setRegistryLoading(false);
      if (!ok) return;

      const stored = loadConnection(selectedTokenId);
      if (!stored) return;
      setProbing(true);
      const result = await probeInstance(stored, selectedTokenId);
      if (cancelled) return;
      setProbing(false);
      if ('meta' in result && !('error' in result)) {
        setConn(stored);
        setMeta(result.meta);
      } else {
        setProbeError((result as { error: ProbeError }).error);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedTokenId, checkOwnership]);

  useEffect(() => {
    if (!conn || selectedTokenId === null) return;
    const recheck = async () => {
      const ok = await checkOwnership(selectedTokenId);
      if (!ok) {
        setOwnershipLost(true);
        setConn(null);
        setMeta(null);
      }
    };
    const interval = setInterval(recheck, 5 * 60 * 1000);
    const onFocus = () => { void recheck(); };
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [conn, selectedTokenId, checkOwnership]);

  const handleConnected = (newConn: ConsoleConnection, newMeta: ConsoleMeta) => {
    setConn(newConn);
    setMeta(newMeta);
    setProbeError(null);
  };

  const handleDisconnect = () => {
    if (selectedTokenId !== null) clearConnection(selectedTokenId);
    setConn(null);
    setMeta(null);
    setProbeError(null);
  };

  if (!isConnected) return null;

  const connectable = selected !== null && selected.bound === true
    && !!address && selected.controller === address.toLowerCase();

  return (
    <div className="max-w-4xl mx-auto space-y-3">
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 bg-background overflow-hidden shadow-sm">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-neutral-100 dark:border-neutral-800">
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-2 text-xs hover:opacity-70 transition-opacity"
              style={font}
              disabled={agentsLoading}
            >
              {selected ? (
                <>
                  <Image src={selected.image} alt="" width={20} height={20} className="rounded-sm" unoptimized />
                  <span>{selected.name}</span>
                </>
              ) : (
                <span className="text-muted-foreground">
                  {agentsLoading ? 'Loading your BOOAs…' : 'Select a BOOA'}
                </span>
              )}
              <ChevronDown className="w-3 h-3" />
            </button>
            {dropdownOpen && (
              <div className="absolute top-full left-0 mt-1 z-50 w-64 max-h-52 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-800 bg-background shadow-lg chat-scrollbar">
                {agents.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground" style={font}>No BOOAs found</div>
                )}
                {agents.map((a) => (
                  <button
                    key={a.tokenId}
                    onClick={() => { setSelectedTokenId(a.tokenId); setDropdownOpen(false); }}
                    className="flex items-center gap-2 w-full px-3 py-2 text-xs text-left hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
                    style={font}
                  >
                    <Image src={a.image} alt="" width={20} height={20} className="rounded-sm" unoptimized />
                    <span className="flex-1 truncate">{a.name}</span>
                    {a.agentId === null && <span className="text-[9px] uppercase text-muted-foreground">not awakened</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {conn && (
            <div className="flex items-center gap-3">
              <span className="text-[10px] text-muted-foreground truncate max-w-[180px]" style={font}>
                {new URL(conn.instanceUrl).host}
              </span>
              <button
                onClick={handleDisconnect}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title="Disconnect and forget this instance"
              >
                <Unplug className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {conn && meta && (
          <div className="flex items-center gap-1 px-4 pt-2.5">
            {(['chat', 'logs', 'data'] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-3 py-1.5 text-[10px] uppercase tracking-wider rounded-md transition-colors ${
                  tab === t
                    ? 'bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                style={font}
              >
                {t}
              </button>
            ))}
          </div>
        )}

        <div>
          {selectedTokenId === null && (
            <div className="px-4 py-10 text-center text-xs text-muted-foreground" style={font}>
              Pick one of your BOOAs above to open its console.
            </div>
          )}

          {selectedTokenId !== null && registryLoading && (
            <div className="px-4 py-10 text-center text-xs text-muted-foreground" style={font}>
              Checking agent binding…
            </div>
          )}

          {selectedTokenId !== null && !registryLoading && !connectable && selected && (
            <div className="px-4 py-10 text-center space-y-2" style={font}>
              <p className="text-xs text-muted-foreground">
                {ownershipLost
                  ? 'This wallet no longer controls this BOOA. The console has been disconnected.'
                  : selected.agentId === null
                    ? 'This BOOA has not been awakened yet.'
                    : selected.bound === false
                      ? 'This agent is not wallet-linked yet. Link it first, then come back.'
                      : 'This wallet does not control this agent.'}
              </p>
              {selected.agentId === null && (
                <a href="/studio/my-agents" className="inline-block text-xs underline underline-offset-2">
                  Go to My Agents
                </a>
              )}
            </div>
          )}

          {selectedTokenId !== null && !registryLoading && connectable && !conn && (
            <ConnectPanel
              tokenId={selectedTokenId}
              probing={probing}
              initialError={probeError}
              onConnected={handleConnected}
            />
          )}

          {conn && meta && selectedTokenId !== null && (
            <>
              {tab === 'chat' && <ChatPanel conn={conn} />}
              {tab === 'logs' && <LogsPanel conn={conn} />}
              {tab === 'data' && (
                <DataPanel
                  conn={conn}
                  meta={meta}
                  agentName={selected?.name || `BOOA #${selectedTokenId}`}
                  agentWallet={selected?.agentWallet || null}
                  onMetaRefresh={(m) => setMeta(m)}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
