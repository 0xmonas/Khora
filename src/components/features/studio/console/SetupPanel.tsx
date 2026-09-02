'use client';

import { useState } from 'react';
import { Eye, EyeOff, ExternalLink, Check } from 'lucide-react';
import { ConsoleConnection, probeInstance, saveConnection, validateInstanceUrl } from './connection';
import { ConsoleMeta } from './types';

const font = { fontFamily: 'var(--font-departure-mono)' };

const DEPLOY_URL = 'https://railway.com/deploy/booa-hermes-template?referralCode=gD4PGO';
const DEFAULT_MODEL = 'anthropic/claude-haiku-4.5';
const inputClass =
  'w-full px-3 py-2 text-xs rounded-md border border-neutral-200 dark:border-neutral-800 bg-background focus:outline-none focus:ring-1 focus:ring-neutral-400';

interface CatalogModel { id: string; name: string; prompt_price: string; completion_price: string }

interface BootstrapResponse {
  ok: boolean;
  console_key: string;
  template_version: string;
  setup_complete: boolean;
  token_id: number | null;
  agent_name: string;
}

interface Props {
  tokenId: number;
  onConnected: (conn: ConsoleConnection, meta: ConsoleMeta) => void;
}

type Step = 'deploy' | 'connect' | 'setup';

function perMTok(v: string): string {
  const n = parseFloat(v);
  return Number.isFinite(n) ? `$${(n * 1e6).toFixed(2).replace(/\.?0+$/, '')}` : '?';
}

async function postJson(url: string, body: unknown, key?: string): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    return await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export function SetupPanel({ tokenId, onConnected }: Props) {
  const [step, setStep] = useState<Step>('deploy');
  const [url, setUrl] = useState('');
  const [origin, setOrigin] = useState('');
  const [adminPw, setAdminPw] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [consoleKey, setConsoleKey] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [apiKey, setApiKey] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [modelQuery, setModelQuery] = useState('');
  const [modelsOpen, setModelsOpen] = useState(false);
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);
  const [ownerName, setOwnerName] = useState('');
  const [language, setLanguage] = useState('English');
  const [tasks, setTasks] = useState('');
  const [telegram, setTelegram] = useState('');

  const finish = async (instanceOrigin: string, key: string) => {
    const conn = saveConnection(tokenId, instanceOrigin, key);
    if (!conn) {
      setError('Could not store the connection in this browser.');
      return;
    }
    const result = await probeInstance(conn, tokenId);
    if ('meta' in result && !('error' in result)) {
      setAdminPw('');
      onConnected(conn, result.meta);
    } else {
      setError('Connected, but the instance did not answer the console probe. Reload and try Connect.');
    }
  };

  const handleBootstrap = async () => {
    setError(null);
    const o = validateInstanceUrl(url);
    if (!o) {
      setError('Enter the full https:// URL of your instance, with nothing after the host.');
      return;
    }
    setBusy('Checking your instance…');
    try {
      const res = await postJson(`${o}/console/bootstrap`, { admin_password: adminPw });
      if (res.status === 403) { setError('Wrong admin password.'); return; }
      if (res.status === 404) {
        setError('This instance runs a template older than v1.3.0. Redeploy it on Railway first, then come back.');
        return;
      }
      if (!res.ok) { setError(`The instance answered ${res.status}.`); return; }
      const d = (await res.json()) as BootstrapResponse;
      if (!d.console_key) { setError('The instance did not return a console key.'); return; }
      setOrigin(o);
      setConsoleKey(d.console_key);
      if (d.setup_complete) {
        if (d.token_id !== tokenId) {
          setError(`This instance already runs BOOA #${d.token_id}, not #${tokenId}.`);
          return;
        }
        await finish(o, d.console_key);
        return;
      }
      setStep('setup');
      void fetch(`${o}/console/models`, { headers: { Authorization: `Bearer ${d.console_key}` } })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => { if (j?.models) setCatalog(j.models); })
        .catch(() => { /* free-text model entry still works */ });
    } catch {
      setError("Can't reach this instance. Check the URL and that the Railway service is live (the first boot takes a minute).");
    } finally {
      setBusy(null);
    }
  };

  const handleSetup = async () => {
    setError(null);
    if (apiKey.trim().length < 8) { setError('Paste your OpenRouter API key.'); return; }
    if (!/^[A-Za-z0-9._/:-]{1,128}$/.test(model.trim())) { setError('Pick a model from the list or enter a valid provider/model id.'); return; }
    setBusy('Setting up your agent — fetching its onchain identity…');
    try {
      const res = await postJson(`${origin}/console/setup`, {
        admin_password: adminPw,
        token_id: tokenId,
        api_key: apiKey.trim(),
        model: model.trim(),
        owner_name: ownerName.trim(),
        language: language.trim() || 'English',
        tasks: tasks.trim(),
        telegram_token: telegram.trim(),
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 409) { await finish(origin, consoleKey); return; }
      if (!res.ok) {
        setError(typeof d.error === 'string' ? d.error : `Setup failed (${res.status}).`);
        return;
      }
      setApiKey('');
      await finish(origin, d.console_key || consoleKey);
    } catch {
      setError('Setup did not complete — the instance stopped answering. Reload and try again; nothing is lost.');
    } finally {
      setBusy(null);
    }
  };

  const filtered = catalog.filter((m) => {
    const q = modelQuery.toLowerCase();
    return m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q);
  }).slice(0, 60);

  const StepDots = () => (
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
      {(['deploy', 'connect', 'setup'] as Step[]).map((s, i) => (
        <span key={s} className={`flex items-center gap-1.5 ${s === step ? 'text-foreground' : ''}`}>
          {i > 0 && <span className="opacity-40">·</span>}
          {['deploy', 'connect', 'setup'].indexOf(step) > i ? <Check className="w-3 h-3" /> : null}
          {s}
        </span>
      ))}
    </div>
  );

  return (
    <div className="px-4 py-6 max-w-md mx-auto space-y-4" style={font}>
      <StepDots />

      {step === 'deploy' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Your agent runs on your own Railway service, so you need a Railway account: about $5/month on the Hobby plan, or a 30-day trial with $5 credit and no card. Everything after the deploy happens here — no dashboard, no terminal.
          </p>
          <ol className="text-[10px] text-muted-foreground leading-relaxed space-y-1 list-decimal list-inside">
            <li>Click Deploy. Railway asks for an admin password — keep it, you need it in the next step.</li>
            <li>In the new service open Settings, Volumes, add a volume at <span className="text-foreground">/data</span>. Railway wipes template-managed volumes on template updates; one you add yourself survives them, which is why this stays manual.</li>
            <li>Wait for the deploy to finish and copy the service URL.</li>
          </ol>
          <a
            href={DEPLOY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 w-full justify-center py-2 text-xs uppercase tracking-wider rounded-md bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 hover:opacity-80 transition-opacity"
          >
            Deploy on Railway <ExternalLink className="w-3 h-3" />
          </a>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Your BOOA #{tokenId} is filled in automatically in the next step.
          </p>
          <button
            onClick={() => setStep('connect')}
            className="w-full py-2 text-xs uppercase tracking-wider rounded-md border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
          >
            My service is live →
          </button>
        </div>
      )}

      {step === 'connect' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Paste the service URL and the admin password. The password goes straight to your instance over HTTPS and is not stored anywhere; it comes back with a console key that stays in this browser.
          </p>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Instance URL</label>
            <input type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-agent.up.railway.app" className={inputClass} style={font} spellCheck={false} />
          </div>
          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Admin password</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={adminPw} onChange={(e) => setAdminPw(e.target.value)} className={`${inputClass} pr-9`} style={font} autoComplete="off" />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPw ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-red-500 leading-relaxed">{error}</p>}
          <button
            onClick={() => void handleBootstrap()}
            disabled={!!busy || !url.trim() || !adminPw}
            className="w-full py-2 text-xs uppercase tracking-wider rounded-md bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 disabled:opacity-40 transition-opacity"
          >
            {busy || 'Continue'}
          </button>
          <button onClick={() => { setError(null); setStep('deploy'); }} className="text-[10px] text-muted-foreground hover:text-foreground">← back</button>
        </div>
      )}

      {step === 'setup' && (
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Instance reached. One form and your agent boots with its onchain identity, skills and guardrails.
          </p>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">OpenRouter API key</label>
            <div className="relative">
              <input type={showApiKey ? 'text' : 'password'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-or-v1-…" className={`${inputClass} pr-9`} style={font} autoComplete="off" spellCheck={false} />
              <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <p className="text-[10px] text-muted-foreground">One key covers the main model and Hermes&apos;s helper tasks. Get one at openrouter.ai.</p>
          </div>

          <div className="space-y-1 relative">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Model</label>
            <input
              type="text"
              value={modelsOpen ? modelQuery : model}
              onChange={(e) => { setModelQuery(e.target.value); setModel(e.target.value); }}
              onFocus={() => { setModelsOpen(true); setModelQuery(''); }}
              onBlur={() => setTimeout(() => setModelsOpen(false), 150)}
              placeholder={DEFAULT_MODEL}
              className={inputClass}
              style={font}
              spellCheck={false}
            />
            {modelsOpen && catalog.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1 z-50 max-h-56 overflow-y-auto rounded-md border border-neutral-200 dark:border-neutral-800 bg-background shadow-lg chat-scrollbar">
                {filtered.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); setModel(m.id); setModelsOpen(false); }}
                    className="flex items-baseline justify-between gap-2 w-full px-3 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-900 transition-colors"
                  >
                    <span className="min-w-0">
                      <span className="block text-xs truncate">{m.name}</span>
                      <span className="block text-[10px] text-muted-foreground truncate">{m.id}</span>
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{perMTok(m.prompt_price)}/{perMTok(m.completion_price)}</span>
                  </button>
                ))}
                {filtered.length === 0 && <p className="px-3 py-2 text-[10px] text-muted-foreground">No match — a raw provider/model id also works.</p>}
              </div>
            )}
            <p className="text-[10px] text-muted-foreground">Tool-capable OpenRouter models, newest first. Change it any time with /model.</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Your name</label>
              <input type="text" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} className={inputClass} style={font} maxLength={120} />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Language</label>
              <input type="text" value={language} onChange={(e) => setLanguage(e.target.value)} className={inputClass} style={font} maxLength={40} />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">What should it do for you? <span className="normal-case tracking-normal">(optional)</span></label>
            <textarea value={tasks} onChange={(e) => setTasks(e.target.value)} rows={2} maxLength={2000} className={`${inputClass} resize-none`} style={font} placeholder="Watch my collections, summarize my mentions, remind me of mints…" />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Telegram bot token <span className="normal-case tracking-normal">(optional)</span></label>
            <input type="text" value={telegram} onChange={(e) => setTelegram(e.target.value)} placeholder="Leave empty to chat from here only" className={inputClass} style={font} spellCheck={false} autoComplete="off" />
          </div>

          {error && <p className="text-xs text-red-500 leading-relaxed">{error}</p>}
          <button
            onClick={() => void handleSetup()}
            disabled={!!busy || apiKey.trim().length < 8}
            className="w-full py-2 text-xs uppercase tracking-wider rounded-md bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 disabled:opacity-40 transition-opacity"
          >
            {busy || 'Start my agent'}
          </button>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Your key and password travel only between this browser and your instance. booa.app never sees them.
          </p>
        </div>
      )}
    </div>
  );
}
