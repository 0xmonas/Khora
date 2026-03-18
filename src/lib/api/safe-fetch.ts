/**
 * SSRF-safe fetch utility.
 * Validates URLs before fetching and blocks redirects to prevent SSRF attacks.
 */

/** Block SSRF: only allow safe external HTTPS URLs */
export function isSafeURL(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Only HTTPS allowed
    if (parsed.protocol !== 'https:') return false;

    const hostname = parsed.hostname.toLowerCase();

    // Block IPv6-wrapped addresses (e.g. [::1], [::ffff:127.0.0.1], [fc00::1])
    if (hostname.startsWith('[')) return false;

    // Block loopback
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0'
    ) return false;

    // Block RFC 1918 private ranges
    if (hostname.startsWith('10.')) return false;
    if (hostname.startsWith('192.168.')) return false;
    // 172.16.0.0 - 172.31.255.255
    if (hostname.startsWith('172.')) {
      const second = parseInt(hostname.split('.')[1], 10);
      if (second >= 16 && second <= 31) return false;
    }

    // Block link-local (169.254.0.0/16)
    if (hostname.startsWith('169.254.')) return false;

    // Block cloud metadata endpoints
    if (hostname === 'metadata.google.internal') return false;

    // Block internal/local TLDs
    if (hostname.endsWith('.internal') || hostname.endsWith('.local')) return false;

    return true;
  } catch {
    return false;
  }
}

/**
 * Fetch with SSRF protection.
 * - Validates URL against blocklist
 * - Disables redirect following (prevents redirect-based SSRF)
 * - Enforces timeout via AbortSignal
 */
export async function safeFetch(url: string, timeoutMs = 10000): Promise<Response> {
  if (!isSafeURL(url)) {
    throw new Error('Blocked: URI points to a disallowed destination');
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error', // Block all redirects — prevents redirect-based SSRF
  });

  return response;
}
