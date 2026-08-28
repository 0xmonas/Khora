'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Download, Upload, RotateCw, ExternalLink, Play, Pause, Trash2, PlayCircle, ShieldOff, Shield, Info, X, Link2, Check } from 'lucide-react';
import { useBalance, useSignTypedData } from 'wagmi';
import { mainnet, base } from 'wagmi/chains';
import { ConsoleConnection, consoleFetch } from './connection';
import { ConsoleMeta, ConsoleJob, OnchainSettings, formatWhen, isOn } from './types';
import { PendingApproval, approvalTypedData, describeAction } from './approvals';
import { notifications } from '@/lib/notifications';

const font = { fontFamily: 'var(--font-departure-mono)' };
const LATEST_CHECK_KEY = 'booa-console:latest-check';
const RELEASES_URL = 'https://api.github.com/repos/0xmonas/booa-hermes-template/releases/latest';

interface Props {
  conn: ConsoleConnection;
  meta: ConsoleMeta;
  agentName: string;
  agentWallet: string | null;
  onMetaRefresh: (meta: ConsoleMeta) => void;
}

function InfoModal({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground/60 hover:text-foreground transition-colors"
        title={title}
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-w-sm w-full rounded-lg border border-neutral-200 dark:border-neutral-800 bg-background p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
            style={font}
          >
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{title}</span>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-muted-foreground leading-relaxed space-y-2">{children}</div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function SectionHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5">
      <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}

function WalletBalances({ wallet }: { wallet: `0x${string}` }) {
  const eth = useBalance({ address: wallet, chainId: mainnet.id, query: { refetchInterval: 60_000 } });
  const bas = useBalance({ address: wallet, chainId: base.id, query: { refetchInterval: 60_000 } });
  const fmt = (v?: { formatted: string; symbol: string }) =>
    v ? `${Number(v.formatted).toFixed(4)} ${v.symbol}` : '…';
  return (
    <div className="text-xs text-muted-foreground space-y-0.5">
      <p>Ethereum {fmt(eth.data)}</p>
      <p>Base {fmt(bas.data)}</p>
    </div>
  );
}

interface MismatchInfo {
  manifestTokenId: number;
  instanceTokenId: number;
}

async function fetchLatestVersion(): Promise<string | null> {
  try {
    const cached = localStorage.getItem(LATEST_CHECK_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Date.now() - parsed.ts < 24 * 60 * 60 * 1000 && parsed.version) return parsed.version;
    }
  } catch { /* ignore */ }
  try {
    const res = await fetch(RELEASES_URL);
    if (!res.ok) return null;
    const d = await res.json();
    const version = String(d.tag_name || '').replace(/^v/, '') || null;
    if (version) {
      try { localStorage.setItem(LATEST_CHECK_KEY, JSON.stringify({ ts: Date.now(), version })); } catch { /* ignore */ }
    }
    return version;
  } catch {
    return null;
  }
}

export function DataPanel({ conn, meta, agentName, agentWallet, onMetaRefresh }: Props) {
  const [exportPw, setExportPw] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPw, setImportPw] = useState('');
  const [archivePw, setArchivePw] = useState('');
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [mismatch, setMismatch] = useState<MismatchInfo | null>(null);
  const [mismatchAck, setMismatchAck] = useState(false);

  const [latest, setLatest] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);

  const [jobs, setJobs] = useState<ConsoleJob[]>([]);
  const [jobsState, setJobsState] = useState<'loading' | 'ready' | 'unavailable' | 'error'>('loading');
  const [jobBusy, setJobBusy] = useState<string | null>(null);

  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [approvalBusy, setApprovalBusy] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const { signTypedDataAsync } = useSignTypedData();

  const [linkPw, setLinkPw] = useState('');
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkStarted, setLinkStarted] = useState(false);

  const [onchain, setOnchain] = useState<OnchainSettings | null>(null);
  const [draft, setDraft] = useState<OnchainSettings>({});
  const [onchainBusy, setOnchainBusy] = useState(false);
  const [onchainError, setOnchainError] = useState<string | null>(null);
  const [onchainNote, setOnchainNote] = useState<string | null>(null);

  const loadOnchain = useCallback(async () => {
    try {
      const res = await consoleFetch(conn, '/onchain-settings');
      if (!res.ok) return;
      const d = await res.json();
      setOnchain(d.settings || null);
      setDraft(d.settings || {});
    } catch { /* surfaced on the next action */ }
  }, [conn]);

  useEffect(() => { void loadOnchain(); }, [loadOnchain]);

  const loadApprovals = useCallback(async () => {
    try {
      const res = await consoleFetch(conn, '/approvals');
      if (!res.ok) return;
      const d = await res.json();
      setApprovals((Array.isArray(d.approvals) ? d.approvals : []).filter(
        (a: PendingApproval) => a && typeof a.id === 'string' && a.action && typeof a.nonce === 'string',
      ));
    } catch { /* section simply stays empty */ }
  }, [conn]);

  useEffect(() => {
    void loadApprovals();
    const iv = setInterval(() => void loadApprovals(), 30_000);
    return () => clearInterval(iv);
  }, [loadApprovals]);

  const approveAction = async (a: PendingApproval) => {
    setApprovalBusy(a.id);
    setApprovalError(null);
    try {
      const signature = await signTypedDataAsync(approvalTypedData(a));
      const res = await consoleFetch(conn, `/approvals/${encodeURIComponent(a.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setApprovalError(typeof d.error === 'string' ? d.error : 'Approval failed.');
        return;
      }
      notifications.push({ kind: 'txn', title: 'Action approved', detail: describeAction(a.action) });
      await loadApprovals();
    } catch {
      setApprovalError('Signature rejected or instance unreachable.');
    } finally {
      setApprovalBusy(null);
    }
  };

  const startWalletLink = async () => {
    if (!linkPw) return;
    setLinking(true);
    setLinkError(null);
    try {
      const res = await consoleFetch(conn, '/wallet/link-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ admin_password: linkPw }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.url) {
        setLinkError(typeof d.error === 'string'
          ? (d.error === 'admin_password_required' ? 'Wrong admin password.' : d.error)
          : 'Could not generate a link code.');
        return;
      }
      setLinkPw('');
      setLinkStarted(true);
      window.open(d.url, '_blank', 'noopener');
    } catch {
      setLinkError('Instance unreachable.');
    } finally {
      setLinking(false);
    }
  };

  const saveOnchain = async (change: Record<string, string>, label: string) => {
    setOnchainBusy(true);
    setOnchainError(null);
    setOnchainNote(null);
    try {
      let res = await consoleFetch(conn, '/onchain-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(change),
      });
      if (res.status === 403) {
        const pw = prompt(`${label} widens what your agent may spend, so it needs your instance admin password.`);
        if (!pw) return;
        res = await consoleFetch(conn, '/onchain-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...change, admin_password: pw }),
        });
      }
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOnchainError(typeof d.error === 'string' ? d.detail || d.error : 'Could not save.');
        return;
      }
      setOnchain(d.settings || null);
      setDraft(d.settings || {});
      setOnchainNote(typeof d.note === 'string' ? d.note : 'Saved.');
    } catch {
      setOnchainError('Instance unreachable.');
    } finally {
      setOnchainBusy(false);
    }
  };

  const ONCHAIN_FIELDS: { key: keyof OnchainSettings; label: string; placeholder?: string; bool?: boolean }[] = [
    { key: 'BOOA_ONCHAIN_MCP', label: 'Read tools (balances, prices, portfolio)', bool: true },
    { key: 'BOOA_ONCHAIN_WRITES', label: 'Trading & wallet actions — moves real funds', bool: true },
    { key: 'BOOA_MAX_TX_ETH', label: 'Per-transaction ETH cap', placeholder: 'e.g. 0.05' },
    { key: 'BOOA_DAILY_CAP_ETH', label: 'Daily ETH cap', placeholder: 'e.g. 0.2' },
    { key: 'BOOA_MAX_SLIPPAGE_BPS', label: 'Max slippage (bps)', placeholder: '300' },
    { key: 'BOOA_SEND_ALLOWLIST', label: 'Send allowlist (comma-separated 0x…)', placeholder: '0x…, 0x…' },
    { key: 'BOOA_SWAP_TOKEN_ALLOWLIST', label: 'Swap token allowlist', placeholder: '0x…  (USDC, WETH always allowed)' },
    { key: 'BOOA_OPENSEA_MCP', label: 'OpenSea (search + trading)', bool: true },
    { key: 'BOOA_OPENSEA_REQUIRE_VERIFIED', label: 'Only buy OpenSea-verified collections', bool: true },
  ];

  const dirtyKeys = ONCHAIN_FIELDS
    .map((f) => f.key)
    .filter((k) => String(draft[k] ?? '').trim() !== String(onchain?.[k] ?? '').trim());

  const saveTrading = async () => {
    if (dirtyKeys.length === 0) return;
    const change: Record<string, string> = {};
    for (const k of dirtyKeys) change[k] = String(draft[k] ?? '').trim();
    await saveOnchain(change, 'This change');
  };

  const loadJobs = useCallback(async () => {
    try {
      const res = await consoleFetch(conn, '/api/jobs?include_disabled=true');
      if (res.status === 501) { setJobsState('unavailable'); return; }
      if (!res.ok) { setJobsState('error'); return; }
      const d = await res.json();
      setJobs(Array.isArray(d.jobs) ? d.jobs : []);
      setJobsState('ready');
    } catch {
      setJobsState('error');
    }
  }, [conn]);

  useEffect(() => { void loadJobs(); }, [loadJobs]);

  const jobAction = async (job: ConsoleJob, action: 'pause' | 'resume' | 'run' | 'delete') => {
    if (action === 'run' && !confirm(`Run "${job.name || job.id}" now? It uses your own model credits.`)) return;
    if (action === 'delete' && !confirm(`Delete "${job.name || job.id}"? This removes the scheduled job for good.`)) return;
    setJobBusy(job.id);
    try {
      const path = `/api/jobs/${encodeURIComponent(job.id)}${action === 'delete' ? '' : `/${action}`}`;
      await consoleFetch(conn, path, { method: action === 'delete' ? 'DELETE' : 'POST' });
      if (action === 'run') {
        notifications.push({ kind: 'cron', title: 'Job started', detail: job.name || job.id, href: '/studio/agent-console' });
      }
      await loadJobs();
    } catch {
      setJobsState('error');
    } finally {
      setJobBusy(null);
    }
  };

  useEffect(() => {
    void fetchLatestVersion().then(setLatest);
  }, []);

  const handleExport = async () => {
    if (!exportPw) return;
    setExporting(true);
    setExportError(null);
    try {
      const res = await consoleFetch(conn, '/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: exportPw }),
      });
      if (!res.ok) {
        setExportError('Export failed — wrong admin password?');
        return;
      }
      const blob = await res.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      a.download = `${agentName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-backup-${date}.zip`;
      a.click();
      URL.revokeObjectURL(a.href);
      setExportPw('');
    } catch {
      setExportError('Export failed — instance unreachable.');
    } finally {
      setExporting(false);
    }
  };

  const sendImport = useCallback(async (confirmMismatch: boolean) => {
    if (!importFile || !importPw) return;
    if (importFile.size > 200 * 1024 * 1024) {
      setImportError('Archive is larger than 200 MB.');
      return;
    }
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      const fd = new FormData();
      fd.append('archive', importFile);
      fd.append('admin_password', importPw);
      if (archivePw) fd.append('archive_password', archivePw);
      if (confirmMismatch) fd.append('confirm_token_mismatch', '1');
      const res = await consoleFetch(conn, '/import', { method: 'POST', body: fd });
      const d = await res.json().catch(() => ({}));
      if (res.status === 409 && d.error === 'token_mismatch') {
        setMismatch({ manifestTokenId: d.manifest_token_id, instanceTokenId: d.instance_token_id });
        setMismatchAck(false);
        return;
      }
      if (!res.ok) {
        setImportError(typeof d.error === 'string' ? d.error : 'Import failed.');
        return;
      }
      setMismatch(null);
      const parts = [`Restored: ${(d.restored || []).join(', ') || 'nothing'}`];
      if ((d.warnings || []).length) parts.push(d.warnings.join(' · '));
      setImportResult(parts.join(' — '));
      setImportFile(null);
      setImportPw('');
      setArchivePw('');
    } catch {
      setImportError('Import failed — instance unreachable.');
    } finally {
      setImporting(false);
    }
  }, [conn, importFile, importPw, archivePw]);

  const handleRestart = async () => {
    if (!confirm('Restart the gateway? Active chats reconnect after a few seconds.')) return;
    setRestarting(true);
    try {
      await consoleFetch(conn, '/gateway/restart', { method: 'POST' });
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const res = await consoleFetch(conn, '/meta');
        if (res.ok) {
          const m = await res.json();
          onMetaRefresh(m);
          if (m.gateway?.running) {
            notifications.push({ kind: 'info', title: 'Gateway restarted', detail: agentName });
            break;
          }
        }
      }
    } finally {
      setRestarting(false);
    }
  };

  const updateAvailable = latest !== null && latest !== meta.template_version;

  return (
    <div className="px-4 py-4 space-y-5 max-w-lg" style={font}>
      <section className="space-y-2">
        <SectionHead title="Agent wallet" />
        {agentWallet ? (
          <div className="space-y-1">
            <p className="text-xs flex items-center gap-1.5">
              <span className="text-emerald-600 dark:text-emerald-400">linked</span>
              <span className="text-muted-foreground">{agentWallet.slice(0, 10)}…{agentWallet.slice(-6)}</span>
              <a
                href={`https://etherscan.io/address/${agentWallet}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="w-3 h-3" />
              </a>
            </p>
            <WalletBalances wallet={agentWallet as `0x${string}`} />
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              No wallet linked yet. Your instance signs its consent, then your wallet submits it onchain in the Bridge.
            </p>
            {linkStarted ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                Bridge opened in a new tab — finish the onchain step there, then reconnect here to see balances.
              </p>
            ) : (
              <div className="flex gap-2">
                <input
                  type="password"
                  value={linkPw}
                  onChange={(e) => setLinkPw(e.target.value)}
                  placeholder="Admin password"
                  className="flex-1 px-3 py-2 text-xs rounded-md border border-neutral-200 dark:border-neutral-800 bg-background focus:outline-none focus:ring-1 focus:ring-neutral-400"
                  autoComplete="off"
                />
                <button
                  onClick={() => void startWalletLink()}
                  disabled={linking || !linkPw}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-[10px] uppercase tracking-wider rounded-md bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 disabled:opacity-40"
                >
                  <Link2 className="w-3 h-3" />
                  {linking ? 'Preparing…' : 'Link wallet'}
                </button>
              </div>
            )}
            {linkError && <p className="text-xs text-red-500">{linkError}</p>}
          </div>
        )}
      </section>

      {approvals.some((a) => a.status === 'pending') && (
        <section className="space-y-2">
          <SectionHead title="Pending approvals">
            <InfoModal title="Pending approvals">
              <p>Your agent wants to run a trade-class action (x402 payment, OpenSea buy/list/offer). It stays parked until you approve it here.</p>
              <p>Approving signs an EIP-712 message with your wallet; the instance verifies the signature against the agent&apos;s current onchain controller. One approval covers exactly one action, once, for 10 minutes.</p>
              <p>To refuse, simply do nothing — the request expires on its own. Then tell your agent why.</p>
            </InfoModal>
          </SectionHead>
          <div className="space-y-2">
            {approvals.filter((a) => a.status === 'pending').map((a) => (
              <div key={a.id} className="flex items-start justify-between gap-3 p-2.5 rounded-md border border-amber-400/50 bg-amber-50 dark:bg-amber-950/30">
                <div className="min-w-0 space-y-0.5">
                  <p className="text-xs break-words">{describeAction(a.action)}</p>
                  <p className="text-[10px] text-muted-foreground">expires {formatWhen(a.deadline * 1000)}</p>
                </div>
                <button
                  onClick={() => void approveAction(a)}
                  disabled={approvalBusy !== null}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider rounded-md bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 disabled:opacity-40 shrink-0"
                >
                  <Check className="w-3 h-3" />
                  {approvalBusy === a.id ? 'Signing…' : 'Approve'}
                </button>
              </div>
            ))}
          </div>
          {approvalError && <p className="text-xs text-red-500">{approvalError}</p>}
        </section>
      )}

      <section className="space-y-2">
        <SectionHead title="Runtime">
          {updateAvailable && (
            <InfoModal title={`Update available — v${latest}`}>
              <p>Updates ship as image rebuilds; your data volume (memories, sessions, wallet) is untouched.</p>
              <p>Open your service in Railway, pull the latest template changes, and it rebuilds automatically. Reconnect here afterwards.</p>
            </InfoModal>
          )}
        </SectionHead>
        <div className="text-xs space-y-1">
          <p className={meta.gateway.running ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
            Gateway {meta.gateway.running ? `running · up ${Math.floor(meta.gateway.uptime / 60)}m` : 'stopped'}
          </p>
          {(meta.provider || meta.model) && (
            <p className="text-muted-foreground">Model {meta.model || '?'}{meta.provider ? ` · ${meta.provider}` : ''}</p>
          )}
          {meta.skills && meta.skills.length > 0 && (
            <p className="text-muted-foreground">Skills {meta.skills.filter((s) => !s.startsWith('.')).join(', ')}</p>
          )}
          <p>
            Template v{meta.template_version}
            {updateAvailable && <span className="text-amber-600 dark:text-amber-400"> · v{latest} available</span>}
          </p>
          <p className="text-muted-foreground">Hermes {meta.hermes_version || 'unknown'}{meta.hermes_pin ? ` (pinned ${meta.hermes_pin})` : ''}</p>
        </div>
        <button
          onClick={() => void handleRestart()}
          disabled={restarting}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider rounded-md border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-40 transition-colors"
        >
          <RotateCw className={`w-3 h-3 ${restarting ? 'animate-spin' : ''}`} />
          {restarting ? 'Restarting…' : 'Restart gateway'}
        </button>
      </section>

      {onchain && (
        <section className="space-y-3">
          <SectionHead title="Onchain & Trading">
            <InfoModal title="Onchain & Trading">
              <p>These mirror your instance dashboard, live in both directions.</p>
              <p><strong>Tightening</strong> a limit — lowering a cap, removing a destination, turning writes off — works with just this console key, so the brake is always one tap away.</p>
              <p><strong>Loosening</strong> — raising a cap, adding a destination, enabling writes — asks for your instance admin password, so a leaked console key can never widen what your agent may spend.</p>
              <p>Toggles take effect after a gateway restart; limits and allowlists apply immediately. The agent has a shell, so a spend rule in your OWS policy is the limit it truly cannot get around.</p>
            </InfoModal>
          </SectionHead>

          {isOn(draft.BOOA_ONCHAIN_WRITES) ? (
            <button
              onClick={() => {
                if (confirm('Turn off onchain writes? Your agent stops being able to move funds after the gateway restarts.')) {
                  setDraft((d) => ({ ...d, BOOA_ONCHAIN_WRITES: '0' }));
                  void saveOnchain({ BOOA_ONCHAIN_WRITES: '0' }, 'Turning writes off');
                }
              }}
              disabled={onchainBusy}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider rounded-md bg-red-600 text-white disabled:opacity-40 transition-opacity"
            >
              <ShieldOff className="w-3 h-3" /> Stop onchain writes
            </button>
          ) : (
            <p className="inline-flex items-center gap-1.5 text-xs">
              <Shield className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
              <span className="text-emerald-600 dark:text-emerald-400">writes off</span>
              <span className="text-muted-foreground">— your agent cannot move funds</span>
            </p>
          )}

          {isOn(draft.BOOA_ONCHAIN_WRITES) && (!draft.BOOA_MAX_TX_ETH?.trim() || !draft.BOOA_SEND_ALLOWLIST?.trim()) && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              No ceiling or no allowlist set — funds can move freely. Add both below.
            </p>
          )}

          <div className="space-y-2.5">
            {ONCHAIN_FIELDS.map((f) => (
              f.bool ? (
                <label key={f.key} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={isOn(draft[f.key])}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.checked ? '1' : '0' }))}
                  />
                  <span>{f.label}</span>
                </label>
              ) : (
                <label key={f.key} className="block text-xs space-y-1">
                  <span className="text-muted-foreground">{f.label}</span>
                  <input
                    type="text"
                    value={draft[f.key] ?? ''}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="w-full px-3 py-2 text-xs rounded-md border border-neutral-200 dark:border-neutral-800 bg-background focus:outline-none focus:ring-1 focus:ring-neutral-400"
                    style={font}
                    spellCheck={false}
                  />
                </label>
              )
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => void saveTrading()}
              disabled={onchainBusy || dirtyKeys.length === 0}
              className="px-3 py-2 text-[10px] uppercase tracking-wider rounded-md bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 disabled:opacity-40 transition-opacity"
            >
              {onchainBusy ? 'Saving…' : dirtyKeys.length ? `Save ${dirtyKeys.length} change(s)` : 'Saved'}
            </button>
            {onchainNote && <span className="text-xs text-emerald-600 dark:text-emerald-400">{onchainNote}</span>}
            {onchainError && <span className="text-xs text-red-500">{onchainError}</span>}
          </div>
        </section>
      )}

      <section className="space-y-2">
        <SectionHead title="Scheduled jobs">
          <InfoModal title="Scheduled jobs">
            <p>Every cron job on your instance, with its schedule and next/last run.</p>
            <p>Pause, resume, run now, or delete a job from here. New jobs are created by asking your agent in chat — the console manages what already runs but never schedules new autonomous work on its own.</p>
          </InfoModal>
        </SectionHead>
        {jobsState === 'loading' && (
          <p className="text-xs text-muted-foreground">Checking what&apos;s scheduled…</p>
        )}
        {jobsState === 'unavailable' && (
          <p className="text-xs text-muted-foreground">This instance has no cron module, so nothing can be scheduled.</p>
        )}
        {jobsState === 'error' && (
          <p className="text-xs text-red-500">Could not read scheduled jobs.</p>
        )}
        {jobsState === 'ready' && jobs.length === 0 && (
          <p className="text-xs text-muted-foreground leading-relaxed">
            Nothing scheduled. Ask your agent in chat to set up a recurring task and it shows up here.
          </p>
        )}
        {jobsState === 'ready' && jobs.length > 0 && (
          <div className="space-y-2">
            {jobs.map((job) => {
              const paused = job.enabled === false || job.state === 'paused';
              const busy = jobBusy === job.id;
              return (
                <div
                  key={job.id}
                  className="flex items-start justify-between gap-3 p-2.5 rounded-md border border-neutral-200 dark:border-neutral-800"
                >
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-xs truncate">
                      {job.name || job.id}
                      <span className={`ml-2 text-[10px] uppercase tracking-wider ${paused ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        {paused ? 'paused' : 'scheduled'}
                      </span>
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {job.schedule_display || job.schedule || 'custom schedule'}
                      {' · next '}{paused ? '—' : formatWhen(job.next_run_at)}
                      {' · last '}{formatWhen(job.last_run_at)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => void jobAction(job, paused ? 'resume' : 'pause')}
                      disabled={busy}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-40 transition-colors"
                      title={paused ? 'Resume' : 'Pause'}
                    >
                      {paused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                    </button>
                    <button
                      onClick={() => void jobAction(job, 'run')}
                      disabled={busy}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-40 transition-colors"
                      title="Run now"
                    >
                      <PlayCircle className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => void jobAction(job, 'delete')}
                      disabled={busy}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-40 transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2">
        <SectionHead title="Export backup">
          <InfoModal title="Export backup">
            <p>Downloads an AES-256 encrypted zip of memories, skills, context, sessions, SOUL.md and the encrypted wallet vault.</p>
            <p>Your instance admin password both authorizes the export and encrypts the archive. It never leaves your machine.</p>
          </InfoModal>
        </SectionHead>
        <div className="flex gap-2">
          <input
            type="password"
            value={exportPw}
            onChange={(e) => setExportPw(e.target.value)}
            placeholder="Admin password"
            className="flex-1 px-3 py-2 text-xs rounded-md border border-neutral-200 dark:border-neutral-800 bg-background focus:outline-none focus:ring-1 focus:ring-neutral-400"
            autoComplete="off"
          />
          <button
            onClick={() => void handleExport()}
            disabled={exporting || !exportPw}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-[10px] uppercase tracking-wider rounded-md bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 disabled:opacity-40"
          >
            <Download className="w-3 h-3" />
            {exporting ? 'Exporting…' : 'Export'}
          </button>
        </div>
        {exportError && <p className="text-xs text-red-500">{exportError}</p>}
      </section>

      <section className="space-y-2">
        <SectionHead title="Import backup">
          <InfoModal title="Import backup">
            <p>Overwrites memories, skills, context, sessions and SOUL.md on the instance, then restarts the gateway.</p>
            <p>config.yaml and a live wallet vault are never touched. The format is documented in Docs → Console Backup Format.</p>
          </InfoModal>
        </SectionHead>
        <input
          type="file"
          accept=".zip"
          onChange={(e) => { setImportFile(e.target.files?.[0] || null); setImportResult(null); setImportError(null); setMismatch(null); }}
          className="block w-full text-xs text-muted-foreground file:mr-3 file:px-3 file:py-1.5 file:text-[10px] file:uppercase file:tracking-wider file:rounded-md file:border file:border-neutral-200 dark:file:border-neutral-800 file:bg-transparent file:text-foreground"
        />
        {importFile && (
          <div className="space-y-2">
            <input
              type="password"
              value={importPw}
              onChange={(e) => setImportPw(e.target.value)}
              placeholder="Admin password (this instance)"
              className="w-full px-3 py-2 text-xs rounded-md border border-neutral-200 dark:border-neutral-800 bg-background focus:outline-none focus:ring-1 focus:ring-neutral-400"
              autoComplete="off"
            />
            <input
              type="password"
              value={archivePw}
              onChange={(e) => setArchivePw(e.target.value)}
              placeholder="Archive password — only if it differs"
              className="w-full px-3 py-2 text-xs rounded-md border border-neutral-200 dark:border-neutral-800 bg-background focus:outline-none focus:ring-1 focus:ring-neutral-400"
              autoComplete="off"
            />
            <button
              onClick={() => {
                if (confirm('Import this backup? Current memories, skills, context, sessions and SOUL.md are replaced. The gateway restarts.')) {
                  void sendImport(false);
                }
              }}
              disabled={importing || !importPw}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-[10px] uppercase tracking-wider rounded-md bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 disabled:opacity-40"
            >
              <Upload className="w-3 h-3" />
              {importing ? 'Importing…' : 'Import'}
            </button>
          </div>
        )}
        {mismatch && (
          <div className="space-y-2 p-3 rounded-md border border-amber-400/50 bg-amber-50 dark:bg-amber-950/30">
            <p className="text-xs leading-relaxed">
              This backup belongs to BOOA #{mismatch.manifestTokenId}, but this instance runs
              BOOA #{mismatch.instanceTokenId}.
            </p>
            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={mismatchAck}
                onChange={(e) => setMismatchAck(e.target.checked)}
                className="mt-0.5"
              />
              <span>I understand this replaces this agent&apos;s data with another BOOA&apos;s backup.</span>
            </label>
            <button
              onClick={() => void sendImport(true)}
              disabled={!mismatchAck || importing}
              className="px-3 py-1.5 text-[10px] uppercase tracking-wider rounded-md bg-amber-600 text-white disabled:opacity-40"
            >
              Import anyway
            </button>
          </div>
        )}
        {importResult && <p className="text-xs text-emerald-600 dark:text-emerald-400">{importResult}</p>}
        {importError && <p className="text-xs text-red-500">{importError}</p>}
      </section>
    </div>
  );
}
