'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { ConsoleConnection, ProbeError, probeInstance, saveConnection, validateInstanceUrl } from './connection';
import { ConsoleMeta } from './types';

const font = { fontFamily: 'var(--font-departure-mono)' };

const ERROR_COPY: Record<ProbeError, string> = {
  unreachable:
    "Can't reach this instance. Check the URL is correct and the service is running on Railway. If your template predates Agent Console (v1.1.0), update it first — see the update guide in Docs.",
  unauthorized:
    'Key rejected or console disabled. Open your instance dashboard, check the Web Console toggle is enabled, and copy the current key (it may have been rotated).',
  'token-mismatch':
    'This instance runs a different BOOA. Point the right instance at the right agent.',
  'version-old':
    'This instance runs an older template without Agent Console support. Update it on Railway first — see the update guide in Docs.',
};

interface Props {
  tokenId: number;
  probing: boolean;
  initialError: ProbeError | null;
  onConnected: (conn: ConsoleConnection, meta: ConsoleMeta) => void;
}

export function ConnectPanel({ tokenId, probing, initialError, onConnected }: Props) {
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ProbeError | 'invalid-url' | null>(initialError);

  const handleConnect = async () => {
    setError(null);
    const origin = validateInstanceUrl(url);
    if (!origin) {
      setError('invalid-url');
      return;
    }
    const conn: ConsoleConnection = { v: 1, instanceUrl: origin, consoleKey: key.trim(), lastConnectedAt: Date.now() };
    setBusy(true);
    const result = await probeInstance(conn, tokenId);
    setBusy(false);
    if ('meta' in result && !('error' in result)) {
      saveConnection(tokenId, origin, key);
      onConnected(conn, result.meta);
    } else {
      setError((result as { error: ProbeError }).error);
    }
  };

  if (probing) {
    return (
      <div className="px-4 py-10 text-center text-xs text-muted-foreground" style={font}>
        Connecting to your instance…
      </div>
    );
  }

  return (
    <div className="px-4 py-6 max-w-md mx-auto space-y-3" style={font}>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Connect to your own Hermes instance. Find both values on your instance dashboard under
        Web Console. They are stored only in this browser — booa.app never sees them.
      </p>

      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Instance URL</label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://your-agent.up.railway.app"
          className="w-full px-3 py-2 text-xs rounded-md border border-neutral-200 dark:border-neutral-800 bg-background focus:outline-none focus:ring-1 focus:ring-neutral-400"
          style={font}
          spellCheck={false}
        />
      </div>

      <div className="space-y-1">
        <label className="text-[10px] uppercase tracking-wider text-muted-foreground">Console key</label>
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="booa_ck_…"
            className="w-full px-3 py-2 pr-9 text-xs rounded-md border border-neutral-200 dark:border-neutral-800 bg-background focus:outline-none focus:ring-1 focus:ring-neutral-400"
            style={font}
            spellCheck={false}
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => setShowKey(!showKey)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-500 leading-relaxed">
          {error === 'invalid-url'
            ? 'Enter the full https:// URL of your instance, with nothing after the host.'
            : ERROR_COPY[error]}
        </p>
      )}

      <button
        onClick={handleConnect}
        disabled={busy || !url.trim() || !key.trim()}
        className="w-full py-2 text-xs uppercase tracking-wider rounded-md bg-neutral-900 text-neutral-100 dark:bg-neutral-100 dark:text-neutral-900 disabled:opacity-40 transition-opacity"
        style={font}
      >
        {busy ? 'Connecting…' : 'Connect'}
      </button>

      <p className="text-[10px] text-muted-foreground leading-relaxed">
        No instance yet? Deploy one from the Railway template — see Docs → Deploy Your Agent.
        Safari note: saved details may be cleared after 7 days of inactivity; just paste them again.
      </p>
    </div>
  );
}
