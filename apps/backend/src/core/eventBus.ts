import type { HealthSnapshot, StatsSnapshot } from "../domain/BaseService.js";

export type Handler<T> = (payload: T) => void | Promise<void>;

export interface EventMap {
  "service.health.updated": {
    id: string;
    kind: string;
    instanceId: string;
    at: number;
    snapshot?: HealthSnapshot;
  };
  "service.stats.updated": {
    id: string;
    kind: string;
    instanceId: string;
    at: number;
    snapshot?: StatsSnapshot;
  };
  "service.error": {
    id: string;
    kind: string;
    instanceId: string;
    scope: "health" | "stats";
    error: unknown;
    at: number;
  };
  "config:service.created": { id: string; kind: string; instanceId: string };
  "config:service.updated": { id: string; kind: string; instanceId: string };
  "config:service.deleted": { id: string; kind: string; instanceId: string };
  "config:service.renamed": {
    id: string;
    kind: string;
    oldInstanceId: string;
    newInstanceId: string;
  };
  // Active profile changed (ADR-027): lifecycle has finished reconciling which
  // services are monitored. reason distinguishes a manual switch from a
  // network-triggered auto-switch.
  "profile.switched": { profileId: string; reason: "manual" | "auto" };
  // The current LAN's fingerprint matches no profile — the UI surfaces a hint.
  "profile.network.unrecognized": {
    signature: { gatewayMac?: string; gatewayIp?: string; subnet?: string };
  };
  "cache:revalidate.failed": { key: string; error: string };
}

type EventKey = keyof EventMap;

export interface EventBus {
  emit<K extends EventKey>(event: K, payload: EventMap[K]): void;
  on<K extends EventKey>(event: K, handler: Handler<EventMap[K]>): () => void;
}

export function createEventBus(onError?: (err: unknown) => void): EventBus {
  const handlers = new Map<EventKey, Set<Handler<unknown>>>();

  return {
    emit(event, payload) {
      const set = handlers.get(event);
      if (!set) return;
      const safeOnError = (err: unknown): void => {
        if (!onError) return;
        try {
          onError(err);
        } catch (e2) {
          // last-resort: a throwing onError would escape as unhandled rejection.
          console.error("eventBus onError threw", e2);
        }
      };
      for (const h of set) {
        try {
          const maybe = (h as Handler<typeof payload>)(payload);
          if (maybe instanceof Promise) maybe.catch((e) => safeOnError(e));
        } catch (e) {
          safeOnError(e);
        }
      }
    },
    on(event, handler) {
      let set = handlers.get(event);
      if (!set) {
        set = new Set();
        handlers.set(event, set);
      }
      set.add(handler as Handler<unknown>);
      return () => set!.delete(handler as Handler<unknown>);
    },
  };
}
