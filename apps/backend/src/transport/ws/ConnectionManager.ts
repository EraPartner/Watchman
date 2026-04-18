import type { AuthUser, ClientMeta, WsClient } from './types.js';
import { WS_OPEN } from './types.js';

export interface ConnectionManagerDeps {
  maxConnectionsPerIp: number;
  now: () => number;
}

export type AddResult =
  | { ok: true }
  | { ok: false; reason: 'too_many_from_ip' };

export class ConnectionManager {
  private readonly clients = new Map<WsClient, ClientMeta>();
  private readonly byIp = new Map<string, number>();

  constructor(private readonly deps: ConnectionManagerDeps) {}

  add(ws: WsClient, ip: string, user: AuthUser): AddResult {
    const current = this.byIp.get(ip) ?? 0;
    if (current >= this.deps.maxConnectionsPerIp) {
      return { ok: false, reason: 'too_many_from_ip' };
    }
    this.byIp.set(ip, current + 1);
    this.clients.set(ws, { user, ip, connectedAt: this.deps.now(), alive: true });
    return { ok: true };
  }

  remove(ws: WsClient): ClientMeta | null {
    const meta = this.clients.get(ws);
    if (!meta) return null;
    this.clients.delete(ws);
    const current = this.byIp.get(meta.ip) ?? 0;
    if (current <= 1) this.byIp.delete(meta.ip);
    else this.byIp.set(meta.ip, current - 1);
    return meta;
  }

  getMeta(ws: WsClient): ClientMeta | null {
    return this.clients.get(ws) ?? null;
  }

  markAlive(ws: WsClient): void {
    const meta = this.clients.get(ws);
    if (meta) this.clients.set(ws, { ...meta, alive: true });
  }

  markIdle(ws: WsClient): void {
    const meta = this.clients.get(ws);
    if (meta) this.clients.set(ws, { ...meta, alive: false });
  }

  entries(): ReadonlyArray<readonly [WsClient, ClientMeta]> {
    return Array.from(this.clients.entries());
  }

  size(): number {
    return this.clients.size;
  }

  openClients(): WsClient[] {
    const out: WsClient[] = [];
    for (const ws of this.clients.keys()) {
      if (ws.readyState === WS_OPEN) out.push(ws);
    }
    return out;
  }

  clear(): void {
    this.clients.clear();
    this.byIp.clear();
  }
}
