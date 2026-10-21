export interface HandshakeLimiterDeps {
  maxPerWindow: number;
  windowMs: number;
  now: () => number;
}

// Fixed-window cap on WebSocket upgrade attempts per IP. It runs before auth,
// so a client can't brute-force ?token= or churn handshakes; the per-IP
// connection cap in ConnectionManager only counts sockets that stay open.
export class HandshakeLimiter {
  private readonly windows = new Map<
    string,
    { start: number; count: number }
  >();

  constructor(private readonly deps: HandshakeLimiterDeps) {}

  allow(ip: string): boolean {
    const now = this.deps.now();
    this.prune(now);
    const win = this.windows.get(ip);
    if (!win || now - win.start >= this.deps.windowMs) {
      this.windows.set(ip, { start: now, count: 1 });
      return true;
    }
    if (win.count >= this.deps.maxPerWindow) return false;
    win.count += 1;
    return true;
  }

  size(): number {
    return this.windows.size;
  }

  // Drop expired windows so one-off IPs don't accumulate.
  private prune(now: number): void {
    for (const [ip, win] of this.windows) {
      if (now - win.start >= this.deps.windowMs) this.windows.delete(ip);
    }
  }
}
