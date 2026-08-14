'use client';

import { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { notifications, AppNotification } from '@/lib/notifications';

const font = { fontFamily: 'var(--font-departure-mono)' };

const ICON: Record<string, string> = { chat: '💬', cron: '⏱', txn: '⛓', info: 'ℹ' };

function ago(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

export function NotificationBell() {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => notifications.subscribe(setItems), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const unread = items.filter((i) => !i.read).length;

  // No bell until there is something to show — keeps the header clean for
  // everyone not using the console.
  if (items.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) notifications.markAllRead();
        }}
        className="relative h-10 sm:h-12 px-2 text-neutral-500 hover:text-black dark:hover:text-white transition-colors w-fit"
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unread > 0 && (
          <span className="absolute top-1.5 right-1 min-w-[14px] h-[14px] px-1 rounded-full bg-emerald-500 text-white text-[9px] leading-[14px] text-center" style={font}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-72 max-h-80 overflow-y-auto rounded-lg border border-neutral-200 dark:border-neutral-800 bg-background shadow-lg">
          <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-100 dark:border-neutral-800">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground" style={font}>Notifications</span>
            <button
              onClick={() => notifications.clear()}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              style={font}
            >
              Clear
            </button>
          </div>
          {items.map((n) => {
            const body = (
              <div className="px-3 py-2 hover:bg-neutral-50 dark:hover:bg-neutral-900 transition-colors">
                <p className="text-xs flex items-start gap-1.5" style={font}>
                  <span>{ICON[n.kind] || 'ℹ'}</span>
                  <span className="flex-1">{n.title}</span>
                  <span className="text-[9px] text-muted-foreground/60 shrink-0">{ago(n.at)}</span>
                </p>
                {n.detail && <p className="text-[10px] text-muted-foreground mt-0.5 pl-5 break-words" style={font}>{n.detail}</p>}
              </div>
            );
            return n.href ? (
              <a key={n.id} href={n.href} className="block">{body}</a>
            ) : (
              <div key={n.id}>{body}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}
