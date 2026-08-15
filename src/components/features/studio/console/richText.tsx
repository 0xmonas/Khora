import { ExternalLink, Image as ImageIcon } from 'lucide-react';

// One left-to-right pass. Order matters: markdown images before plain image
// URLs before generic URLs, and 64-hex tx hashes before 40-hex addresses so
// a hash is never half-consumed as an address.
const TOKEN_RE =
  /!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s)]+\.(?:png|svg|gif|jpe?g|webp)(?:\?[^\s)]*)?)|(https?:\/\/[^\s)]+)|(\b0x[a-fA-F0-9]{64}\b)|(\b0x[a-fA-F0-9]{40}\b)/g;

// Rendering cap only — the agent's full reply text is untouched; images past
// the cap fall back to plain link chips.
const MAX_IMAGES = 10;

type Token =
  | { type: 'text'; value: string }
  | { type: 'image'; value: string; alt: string }
  | { type: 'url'; value: string }
  | { type: 'tx'; value: string }
  | { type: 'addr'; value: string };

function brandFor(url: string): { label: string; iconSrc?: string } {
  const u = url.toLowerCase();
  if (u.includes('opensea.io')) return { label: 'OpenSea', iconSrc: 'https://opensea.io/static/images/favicon/favicon.ico' };
  if (u.includes('booa.app') || u.includes('khora.fun')) return { label: 'BOOA', iconSrc: '/favicon.ico' };
  if (u.includes('etherscan.io')) return { label: 'Etherscan' };
  if (u.includes('basescan.org')) return { label: 'Basescan' };
  if (u.includes('shapescan.xyz')) return { label: 'Shapescan' };
  if (u.includes('8004scan.io')) return { label: '8004scan' };
  return { label: url.replace(/^https?:\/\//, '').split('/')[0] };
}

function shorten(hex: string): string {
  return `${hex.slice(0, 6)}…${hex.slice(-4)}`;
}

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) tokens.push({ type: 'text', value: text.slice(last, idx) });
    if (m[2]) tokens.push({ type: 'image', value: m[2], alt: m[1] });
    else if (m[3]) tokens.push({ type: 'image', value: m[3], alt: '' });
    else if (m[4]) tokens.push({ type: 'url', value: m[4] });
    else if (m[5]) tokens.push({ type: 'tx', value: m[5] });
    else if (m[6]) tokens.push({ type: 'addr', value: m[6] });
    last = idx + m[0].length;
  }
  if (last < text.length) tokens.push({ type: 'text', value: text.slice(last) });
  return tokens;
}

const chipClass =
  'inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:opacity-80 align-baseline';

export function renderRich(text: string): React.ReactNode[] {
  const tokens = tokenize(text);
  const imageTotal = tokens.reduce((n, t) => (t.type === 'image' ? n + 1 : n), 0);
  const small = imageTotal > 1;
  let imgIdx = 0;

  return tokens.map((t, i) => {
    switch (t.type) {
      case 'text':
        return t.value;
      case 'image': {
        imgIdx++;
        if (imgIdx > MAX_IMAGES) {
          return (
            <a key={i} href={t.value} target="_blank" rel="noopener noreferrer" className={chipClass} title={t.alt || t.value}>
              <ImageIcon className="inline-block w-3 h-3" />
              <span>{t.alt || 'image'}</span>
            </a>
          );
        }
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={t.value}
            alt={t.alt}
            title={t.alt || undefined}
            className={
              small
                ? 'inline-block align-top m-0.5 w-24 h-24 object-contain rounded-md bg-neutral-100 dark:bg-neutral-800'
                : 'block my-2 rounded-md max-w-[200px] w-full h-auto bg-neutral-100 dark:bg-neutral-800'
            }
            style={{ imageRendering: 'pixelated' }}
            loading="lazy"
          />
        );
      }
      case 'url': {
        const b = brandFor(t.value);
        return (
          <a key={i} href={t.value} target="_blank" rel="noopener noreferrer" className={chipClass}>
            {b.iconSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={b.iconSrc} alt="" width={11} height={11} className="inline-block" />
            ) : (
              <ExternalLink className="inline-block w-3 h-3" />
            )}
            <span>{b.label}</span>
          </a>
        );
      }
      case 'tx':
        return (
          <a key={i} href={`https://etherscan.io/tx/${t.value}`} target="_blank" rel="noopener noreferrer" className={chipClass} title={t.value}>
            <ExternalLink className="inline-block w-3 h-3" />
            <span>tx {shorten(t.value)}</span>
          </a>
        );
      case 'addr':
        return (
          <a key={i} href={`https://etherscan.io/address/${t.value}`} target="_blank" rel="noopener noreferrer" className={chipClass} title={t.value}>
            <span>{shorten(t.value)}</span>
          </a>
        );
    }
  });
}
