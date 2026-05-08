import type { ConnectionManager } from './ConnectionManager.js';
import type { EventBus } from '../../core/eventBus.js';
import type { WsClient } from './types.js';

export interface BroadcasterDeps {
  manager: ConnectionManager;
  bus: EventBus;
  now: () => number;
  onSendError?: (err: unknown, ws: WsClient) => void;
}

export type AlertLevel = 'info' | 'warning' | 'error';

export class Broadcaster {
  private unsubs: Array<() => void> = [];

  constructor(private readonly deps: BroadcasterDeps) {}

  start(): void {
    if (this.unsubs.length > 0) return;
    this.unsubs.push(
      this.deps.bus.on('service.health.updated', (p) => {
        this.broadcast({ type: 'service_update', scope: 'health', id: p.id, kind: p.kind, instanceId: p.instanceId, at: p.at, ...(p.snapshot !== undefined ? { snapshot: p.snapshot } : {}) });
      }),
      this.deps.bus.on('service.stats.updated', (p) => {
        this.broadcast({ type: 'service_update', scope: 'stats', id: p.id, kind: p.kind, instanceId: p.instanceId, at: p.at, ...(p.snapshot !== undefined ? { snapshot: p.snapshot } : {}) });
      }),
    );
  }

  stop(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
  }

  alert(level: AlertLevel, message: string, service: string | null = null): number {
    return this.broadcast({ type: 'alert', level, message, service, timestamp: this.isoNow() });
  }

  welcome(ws: WsClient, serverVersion: string): void {
    this.sendOne(ws, { type: 'connection', message: 'Connected', timestamp: this.isoNow(), serverVersion });
  }

  broadcast(payload: Record<string, unknown>): number {
    const msg = JSON.stringify({ ...payload, timestamp: payload['timestamp'] ?? this.isoNow() });
    const dead: WsClient[] = [];
    let sent = 0;
    for (const ws of this.deps.manager.openClients()) {
      try {
        ws.send(msg);
        sent++;
      } catch (e) {
        this.deps.onSendError?.(e, ws);
        dead.push(ws);
      }
    }
    for (const ws of dead) this.deps.manager.remove(ws);
    return sent;
  }

  private sendOne(ws: WsClient, payload: Record<string, unknown>): void {
    try {
      ws.send(JSON.stringify(payload));
    } catch (e) {
      this.deps.onSendError?.(e, ws);
    }
  }

  private isoNow(): string {
    return new Date(this.deps.now()).toISOString();
  }
}
