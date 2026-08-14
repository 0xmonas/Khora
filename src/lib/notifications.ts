export type NotificationKind = 'chat' | 'cron' | 'txn' | 'info';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  detail?: string;
  href?: string;
  at: number;
  read: boolean;
}

type Listener = (items: AppNotification[]) => void;

// A small client-side notification bus shared between the Header bell and any
// tool that emits events (currently Agent Console). It only holds events that
// happen while the page is open — booa.app runs nothing server-side, so there
// is no push when the tab is closed.
class NotificationCenter {
  private items: AppNotification[] = [];
  private listeners = new Set<Listener>();
  private seq = 0;

  push(n: Omit<AppNotification, 'id' | 'at' | 'read'>) {
    const item: AppNotification = {
      ...n,
      id: `${Date.now()}-${this.seq++}`,
      at: Date.now(),
      read: false,
    };
    this.items = [item, ...this.items].slice(0, 50);
    this.emit();
  }

  markAllRead() {
    if (this.items.every((i) => i.read)) return;
    this.items = this.items.map((i) => ({ ...i, read: true }));
    this.emit();
  }

  clear() {
    this.items = [];
    this.emit();
  }

  get(): AppNotification[] {
    return this.items;
  }

  unreadCount(): number {
    return this.items.filter((i) => !i.read).length;
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    fn(this.items);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    for (const fn of this.listeners) fn(this.items);
  }
}

export const notifications = new NotificationCenter();
