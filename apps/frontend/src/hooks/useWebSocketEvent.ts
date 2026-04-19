import { useEffect } from "react";
import {
  subscribeWsEvent,
  type WsEvent,
  type WsEventType,
} from "../lib/wsEventBus";

/**
 * Subscribe to a single WebSocket event type. Handler is re-bound via ref
 * pattern so callers can pass inline callbacks without resubscribing.
 */
export function useWebSocketEvent(
  type: WsEventType | "*",
  handler: (ev: WsEvent) => void
): void {
  useEffect(() => {
    const unsub = subscribeWsEvent((ev) => {
      if (type === "*" || ev.type === type) handler(ev);
    });
    return unsub;
  }, [type, handler]);
}
