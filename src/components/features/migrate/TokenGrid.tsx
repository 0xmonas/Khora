'use client';

import { useEffect, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { useMigrate } from './MigrateContext';

const font = { fontFamily: 'var(--font-departure-mono)' };

function TokenTile({ id, selected, onToggle, disabled }: {
  id: number; selected: boolean; onToggle: (id: number) => void; disabled: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const [img, setImg] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) { setVisible(true); io.disconnect(); }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  useEffect(() => {
    if (!visible || img) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/booa-token?network=mainnet&tokenId=${id}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && typeof data.image === 'string') setImg(data.image);
      } catch { /* leave placeholder */ }
    })();
    return () => { cancelled = true; };
  }, [visible, img, id]);

  return (
    <button
      ref={ref}
      onClick={() => !disabled && onToggle(id)}
      disabled={disabled}
      className={`relative aspect-square border-2 transition-colors overflow-hidden group disabled:cursor-not-allowed ${
        selected
          ? 'border-foreground ring-1 ring-foreground'
          : 'border-neutral-700 dark:border-neutral-600 hover:border-foreground/60'
      }`}
      title={`BOOA #${id}`}
      aria-pressed={selected}
    >
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt={`BOOA #${id}`} className="w-full h-full object-cover" style={{ imageRendering: 'pixelated' }} />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-muted/30 text-[9px] text-muted-foreground/50" style={font}>
          #{id}
        </div>
      )}
      <span className="absolute bottom-0 left-0 right-0 bg-background/80 text-foreground text-[8px] px-1 py-0.5 text-center" style={font}>
        #{id}
      </span>
      {selected && (
        <span className="absolute top-1 right-1 w-4 h-4 bg-foreground text-background flex items-center justify-center">
          <Check className="w-3 h-3" />
        </span>
      )}
    </button>
  );
}

export function TokenGrid() {
  const { holdings, loadingHoldings, selected, toggle, step } = useMigrate();
  const busy = step !== 'idle' && step !== 'error' && step !== 'done';

  if (loadingHoldings) {
    return <p className="text-[11px] text-muted-foreground py-8 text-center" style={font}>Loading your BOOAs…</p>;
  }
  if (holdings.length === 0) {
    return (
      <div className="border-2 border-dashed border-neutral-700 dark:border-neutral-600 p-8 text-center">
        <p className="text-[11px] text-muted-foreground" style={font}>No BOOA found on Shape for this wallet.</p>
        <p className="text-[9px] text-muted-foreground/50 mt-1" style={font}>Already migrated tokens won&apos;t appear here.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-1.5">
      {holdings.map((id) => (
        <TokenTile key={id} id={id} selected={selected.has(id)} onToggle={toggle} disabled={busy} />
      ))}
    </div>
  );
}
