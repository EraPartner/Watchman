/**
 * Tiny in-memory pub/sub shared between useWebSocket and consumers
 * (EventLog, detail sheet). Keeps the public WS API surface small while we
 * migrate away from the singleton hook in Phase 6.
 */

export type WsEventType =
  | "connection"
  | "service_update"
  | "alert"
  | "metrics";

export interface WsEvent {
  type: WsEventType;
  service?: string;
  level?: "info" | "warning" | "error";
  message?: string;
  data?: unknown;
  timestamp: string;
}

type Handler = (ev: WsEvent) => void;

const handlers = new Set<Handler>();

export function publishWsEvent(ev: WsEvent): void {
  handlers.forEach((h) => {
    try {
      h(ev);
    } catch {
      // Swallow handler errors so one bad subscriber can't break others.
    }
  });
}

export function subscribeWsEvent(handler: Handler): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}
