'use client';

import { useState, useEffect, useCallback } from 'react';
import { Download, Upload, RotateCw, ExternalLink, Play, Pause, Trash2, PlayCircle, ShieldOff, Shield } from 'lucide-react';
import { useBalance } from 'wagmi';
import { mainnet, base } from 'wagmi/chains';
import { ConsoleConnection, consoleFetch } from './connection';
import { ConsoleMeta, ConsoleJob, OnchainSettings, formatWhen, isOn } from './types';

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

  const [onchain, setOnchain] = useState<OnchainSettings | null>(null);
  const [onchainBusy, setOnchainBusy] = useState(false);
  const [onchainError, setOnchainError] = useState<string | null>(null);
  const [onchainNote, setOnchainNote] = useState<string | null>(null);

  const loadOnchain = useCallback(async () => {
    try {
      const res = await consoleFetch(conn, '/onchain-settings');
      if (!res.ok) return;
      const d = await res.json();
      setOnchain(d.settings || null);
    } catch { /* surfaced on the next action */ }
  }, [conn]);

  useEffect(() => { void loadOnchain(); }, [loadOnchain]);

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
      setOnchainNote(typeof d.note === 'string' ? d.note : 'Saved.');
    } catch {
      setOnchainError('Instance unreachable.');
    } finally {
      setOnchainBusy(false);
    }
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
          if (m.gateway?.running) break;
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
        <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground">Agent wallet</h3>
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
          <p className="text-xs text-muted-foreground">
            No wallet linked yet — link one from My Agents or the Bridge.
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground">Version</h3>
        <div className="text-xs space-y-1">
          <p>Template v{meta.template_version}{latest ? ` — latest is v${latest}` : ''}</p>
          <p className="text-muted-foreground">Hermes {meta.hermes_version || 'unknown'}{meta.hermes_pin ? ` (pinned ${meta.hermes_pin})` : ''}</p>
          <p className="text-muted-foreground">Gateway {meta.gateway.running ? `running · up ${Math.floor(meta.gateway.uptime / 60)}m` : 'stopped'}</p>
        </div>
        {updateAvailable && (
          <p className="text-xs leading-relaxed text-amber-600 dark:text-amber-400">
            Update available. Updates ship as image rebuilds — your data volume (memories, sessions, wallet)
            is untouched. Open your service in Railway, pull the latest template changes, and it rebuilds
            automatically. Reconnect here afterwards.
          </p>
        )}
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
        <section className="space-y-2">
          <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground">Spending guardrails</h3>
          {isOn(onchain.BOOA_ONCHAIN_WRITES) ? (
            <div className="space-y-2">
              <p className="text-xs flex items-center gap-1.5">
                <span className="text-amber-600 dark:text-amber-400">writes enabled</span>
                <span className="text-muted-foreground">— your agent can move funds</span>
              </p>
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>Per transaction: {onchain.BOOA_MAX_TX_ETH?.trim() || 'no limit'}{onchain.BOOA_MAX_TX_ETH?.trim() ? ' ETH' : ''}</p>
                <p>Daily: {onchain.BOOA_DAILY_CAP_ETH?.trim() || 'no limit'}{onchain.BOOA_DAILY_CAP_ETH?.trim() ? ' ETH' : ''}</p>
                <p>
                  Allowed destinations:{' '}
                  {onchain.BOOA_SEND_ALLOWLIST?.trim()
                    ? `${onchain.BOOA_SEND_ALLOWLIST.split(',').filter((a) => a.trim()).length} address(es)`
                    : 'anywhere'}
                </p>
              </div>
              {(!onchain.BOOA_MAX_TX_ETH?.trim() || !onchain.BOOA_SEND_ALLOWLIST?.trim()) && (
                <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
                  Funds can move with no ceiling or to any address. Set both on your instance
                  dashboard, and put a spend rule in your OWS policy too.
                </p>
              )}
              <button
                onClick={() => {
                  if (confirm('Turn off onchain writes? Your agent stops being able to move funds. Takes effect after the gateway restarts.')) {
                    void saveOnchain({ BOOA_ONCHAIN_WRITES: '0' }, 'Enabling writes');
                  }
                }}
                disabled={onchainBusy}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] uppercase tracking-wider rounded-md bg-red-600 text-white disabled:opacity-40 transition-opacity"
              >
                <ShieldOff className="w-3 h-3" />
                Stop onchain writes
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs flex items-center gap-1.5">
                <Shield className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                <span className="text-emerald-600 dark:text-emerald-400">writes off</span>
                <span className="text-muted-foreground">— your agent cannot move funds</span>
              </p>
              <button
                onClick={() => {
                  if (confirm('Let your agent move funds? Set a per-transaction cap and a destination allowlist on your instance dashboard first.')) {
                    void saveOnchain({ BOOA_ONCHAIN_WRITES: '1' }, 'Enabling writes');
                  }
                }}
                disabled={onchainBusy}
                className="px-3 py-1.5 text-[10px] uppercase tracking-wider rounded-md border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900 disabled:opacity-40 transition-colors"
              >
                Allow onchain writes
              </button>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Tightening a limit works from here. Raising one, or allowing a new destination,
            asks for your instance admin password — so this key alone can never widen what
            your agent may spend.
          </p>
          {onchainNote && <p className="text-xs text-emerald-600 dark:text-emerald-400">{onchainNote}</p>}
          {onchainError && <p className="text-xs text-red-500">{onchainError}</p>}
        </section>
      )}

      <section className="space-y-2">
        <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground">Scheduled jobs</h3>
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
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              New jobs are created by asking your agent in chat, not here — the console can manage
              what already runs, but never schedules new autonomous work on its own.
            </p>
          </div>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground">Export backup</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Downloads an AES-256 encrypted zip of memories, skills, context, sessions, SOUL.md and the
          wallet vault. Your instance admin password both authorizes and encrypts it.
        </p>
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
        <h3 className="text-[10px] uppercase tracking-wider text-muted-foreground">Import backup</h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Overwrites memories, skills, context, sessions and SOUL.md on the instance, then restarts the
          gateway. config.yaml and a live wallet vault are never touched. The format is documented in
          Docs → Console Backup Format.
        </p>
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
