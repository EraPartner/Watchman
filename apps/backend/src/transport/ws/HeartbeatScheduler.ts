import type { ConnectionManager } from './ConnectionManager.js';
import type { WsClient } from './types.js';

export interface HeartbeatDeps {
  intervalMs: number;
  manager: ConnectionManager;
  setInterval: (fn: () => void, ms: number) => unknown;
  clearInterval: (handle: unknown) => void;
  onError?: (err: unknown, ws: WsClient) => void;
}

export class HeartbeatScheduler {
  private handle: unknown = null;

  constructor(private readonly deps: HeartbeatDeps) {}

  start(): void {
    if (this.handle !== null) return;
    this.handle = this.deps.setInterval(() => this.tick(), this.deps.intervalMs);
  }

  stop(): void {
    if (this.handle === null) return;
    this.deps.clearInterval(this.handle);
    this.handle = null;
  }

  tick(): void {
    for (const [ws, meta] of this.deps.manager.entries()) {
      if (!meta.alive) {
        ws.terminate();
        this.deps.manager.remove(ws);
        continue;
      }
      this.deps.manager.markIdle(ws);
      try {
        ws.ping();
      } catch (e) {
        this.deps.onError?.(e, ws);
      }
    }
  }
}
