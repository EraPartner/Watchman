import type { ConnectionManager } from "./ConnectionManager.js";
import type { EventBus } from "../../core/eventBus.js";
import type { WsClient } from "./types.js";

export interface BroadcasterDeps {
  manager: ConnectionManager;
  bus: EventBus;
  now: () => number;
  onSendError?: (err: unknown, ws: WsClient) => void;
}

export type AlertLevel = "info" | "warning" | "error";

export class Broadcaster {
  private unsubs: Array<() => void> = [];
  // `${id}|${scope}` keys currently in error state; used to alert only on
  // transitions (first failure, then recovery) instead of every failed poll.
  // Health and stats are tracked separately: a health tick must not count as
  // the recovery of a stats lane that is still failing (or the two flap a
  // toast pair every stats interval).
  private errored = new Set<string>();

  constructor(private readonly deps: BroadcasterDeps) {}

  start(): void {
    if (this.unsubs.length > 0) return;
    this.unsubs.push(
      this.deps.bus.on("service.health.updated", (p) => {
        // most probes resolve ok() with reachable:false when the service is
        // down; that is not a recovery
        if (p.snapshot?.reachable !== false) {
          this.notifyRecovered(p.id, "health", p.kind, p.instanceId);
        }
        this.broadcast({
          type: "service_update",
          scope: "health",
          id: p.id,
          kind: p.kind,
          instanceId: p.instanceId,
          at: p.at,
          ...(p.snapshot !== undefined ? { snapshot: p.snapshot } : {}),
        });
      }),
      this.deps.bus.on("service.stats.updated", (p) => {
        this.notifyRecovered(p.id, "stats", p.kind, p.instanceId);
        this.broadcast({
          type: "service_update",
          scope: "stats",
          id: p.id,
          kind: p.kind,
          instanceId: p.instanceId,
          at: p.at,
          ...(p.snapshot !== undefined ? { snapshot: p.snapshot } : {}),
        });
      }),
      this.deps.bus.on("service.error", (p) => {
        const key = errorKey(p.id, p.scope);
        if (this.errored.has(key)) return;
        this.errored.add(key);
        const detail =
          p.error instanceof Error ? p.error.message : String(p.error);
        this.broadcast({
          type: "alert",
          level: "error",
          message: `${p.id}: ${detail}`,
          service: p.kind,
          kind: p.kind,
          instanceId: p.instanceId,
          id: p.id,
        });
      }),
      // Sent once the lifecycle has applied the change, so a client refetching
      // /instances on this message sees the new or removed service.
      this.deps.bus.on("config:service.applied", (p) => {
        this.broadcast({
          type: "service_config_changed",
          kind: p.kind,
          instanceId: p.instanceId,
          action: p.action,
        });
      }),
      this.deps.bus.on("profile.switched", (p) => {
        this.broadcast({
          type: "profile_switched",
          profileId: p.profileId,
          reason: p.reason,
        });
      }),
      this.deps.bus.on("profile.network.unrecognized", (p) => {
        this.broadcast({
          type: "profile_network_unrecognized",
          signature: p.signature,
        });
      }),
      // Service ids are kind:instanceId (BaseService.id). Once an instance is
      // gone its error state must go too, or a later instance with the same
      // id has its first failure suppressed and its first success announced
      // as a recovery.
      this.deps.bus.on("config:service.deleted", (p) => {
        this.forget(`${p.kind}:${p.instanceId}`);
      }),
      this.deps.bus.on("config:service.renamed", (p) => {
        this.forget(`${p.kind}:${p.oldInstanceId}`);
      })
    );
  }

  stop(): void {
    for (const u of this.unsubs) u();
    this.unsubs = [];
  }

  alert(
    level: AlertLevel,
    message: string,
    service: string | null = null
  ): number {
    return this.broadcast({
      type: "alert",
      level,
      message,
      service,
      timestamp: this.isoNow(),
    });
  }

  welcome(ws: WsClient, serverVersion: string): void {
    this.sendOne(ws, {
      type: "connection",
      message: "Connected",
      timestamp: this.isoNow(),
      serverVersion,
    });
  }

  broadcast(payload: Record<string, unknown>): number {
    const msg = JSON.stringify({
      ...payload,
      timestamp: payload["timestamp"] ?? this.isoNow(),
    });
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

  private forget(id: string): void {
    this.errored.delete(errorKey(id, "health"));
    this.errored.delete(errorKey(id, "stats"));
  }

  private notifyRecovered(
    id: string,
    scope: "health" | "stats",
    kind: string,
    instanceId: string
  ): void {
    if (!this.errored.delete(errorKey(id, scope))) return;
    this.broadcast({
      type: "alert",
      level: "info",
      message: `${id}: recovered`,
      service: kind,
      kind,
      instanceId,
      id,
    });
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

function errorKey(id: string, scope: "health" | "stats"): string {
  return `${id}|${scope}`;
}
