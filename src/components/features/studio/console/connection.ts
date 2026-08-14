import { ConsoleMeta } from './types';

const STORAGE_PREFIX = 'booa-console:1:';
const MIN_TEMPLATE_VERSION = '1.1.0';

export type ProbeError = 'unreachable' | 'unauthorized' | 'token-mismatch' | 'version-old';

export interface ConsoleConnection {
  v: 1;
  instanceUrl: string;
  consoleKey: string;
  lastConnectedAt: number;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

export function validateInstanceUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  const isLocal = LOCAL_HOSTS.has(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) return null;
  if (url.username || url.password || url.search || url.hash) return null;
  if (url.pathname !== '' && url.pathname !== '/') return null;
  return url.origin;
}

function storageKey(tokenId: number): string {
  return `${STORAGE_PREFIX}${tokenId}`;
}

export function loadConnection(tokenId: number): ConsoleConnection | null {
  try {
    const raw = localStorage.getItem(storageKey(tokenId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsoleConnection;
    if (parsed?.v !== 1 || typeof parsed.consoleKey !== 'string' || !parsed.consoleKey) return null;
    const origin = validateInstanceUrl(parsed.instanceUrl);
    if (!origin) return null;
    return { v: 1, instanceUrl: origin, consoleKey: parsed.consoleKey, lastConnectedAt: parsed.lastConnectedAt || 0 };
  } catch {
    return null;
  }
}

export function saveConnection(tokenId: number, instanceUrl: string, consoleKey: string): ConsoleConnection | null {
  const origin = validateInstanceUrl(instanceUrl);
  if (!origin || !consoleKey.trim()) return null;
  const conn: ConsoleConnection = { v: 1, instanceUrl: origin, consoleKey: consoleKey.trim(), lastConnectedAt: Date.now() };
  try {
    localStorage.setItem(storageKey(tokenId), JSON.stringify(conn));
  } catch { /* quota exceeded */ }
  return conn;
}

export function clearConnection(tokenId: number) {
  try {
    localStorage.removeItem(storageKey(tokenId));
  } catch { /* ignore */ }
}

export function consoleFetch(conn: ConsoleConnection, path: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${conn.consoleKey}`);
  return fetch(`${conn.instanceUrl}/console${path}`, { ...init, headers });
}

function versionAtLeast(version: string, min: string): boolean {
  const a = version.split('.').map((n) => parseInt(n, 10) || 0);
  const b = min.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) > (b[i] || 0)) return true;
    if ((a[i] || 0) < (b[i] || 0)) return false;
  }
  return true;
}

export async function probeInstance(
  conn: ConsoleConnection,
  tokenId: number,
): Promise<{ meta: ConsoleMeta } | { error: ProbeError; meta?: ConsoleMeta }> {
  let res: Response;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    res = await consoleFetch(conn, '/meta', { signal: controller.signal });
    clearTimeout(timer);
  } catch {
    return { error: 'unreachable' };
  }
  if (res.status === 401 || res.status === 403) return { error: 'unauthorized' };
  if (!res.ok) return { error: 'unreachable' };
  let meta: ConsoleMeta;
  try {
    meta = await res.json();
  } catch {
    return { error: 'unreachable' };
  }
  if (!meta.template_version || !versionAtLeast(meta.template_version, MIN_TEMPLATE_VERSION)) {
    return { error: 'version-old', meta };
  }
  if (meta.token_id !== tokenId) return { error: 'token-mismatch', meta };
  return { meta };
}
