export function isAllowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') return false;
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return true;
    return /(^|\.)booa\.app$/i.test(u.hostname);
  } catch {
    return false;
  }
}
