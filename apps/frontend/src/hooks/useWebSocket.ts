import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logger } from "../lib/logger";
import { queryKeys } from "../lib/queryKeys";
import { getWebSocketUrl } from "../lib/backendUrl";
import { publishWsEvent } from "../lib/wsEventBus";

interface WebSocketMessage {
  type:
    | "connection"
    | "service_update"
    | "alert"
    | "metrics"
    | "service_config_changed"
    | "profile_switched"
    | "profile_network_unrecognized";
  service?: string;
  data?: unknown;
  level?: "info" | "warning" | "error";
  message?: string;
  timestamp: string;
  kind?: string;
  instanceId?: string;
  action?: "created" | "updated" | "deleted";
  profileId?: string;
  reason?: "manual" | "auto";
}

// Global singleton to prevent multiple WebSocket instances
let globalWebSocket: WebSocket | null = null;
let globalConnectionState = {
  isConnected: false,
  reconnectAttempts: 0,
  isConnecting: false,
  lastConnectionAttempt: 0,
};

// Connection throttling - prevent connection attempts too frequently
const CONNECTION_THROTTLE_MS = 5000; // 5 seconds minimum between attempts
const MAX_RECONNECT_ATTEMPTS = 5;
const INITIAL_RECONNECT_DELAY = 1000; // 1 second
const MAX_RECONNECT_DELAY = 30000; // 30 seconds

// Subscribers for state changes
const stateSubscribers = new Set<
  (state: typeof globalConnectionState) => void
>();

const notifyStateChange = () => {
  stateSubscribers.forEach((callback) => callback(globalConnectionState));
};

// Global reconnect function reference to avoid circular dependencies
let globalReconnectFn: (() => void) | null = null;

export const useWebSocket = (url?: string) => {
  const [isConnected, setIsConnected] = useState(
    globalConnectionState.isConnected
  );
  const [reconnectAttempts, setReconnectAttempts] = useState(
    globalConnectionState.reconnectAttempts
  );
  const queryClient = useQueryClient();
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const websocketUrl = url || getWebSocketUrl();

  // Debounced/batched invalidation state
  const pendingInvalidationsRef = useRef<Set<string>>(new Set());
  const invalidateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const INVALIDATION_DEBOUNCE_MS = 150;

  // Subscribe to global state changes
  useEffect(() => {
    const updateState = (state: typeof globalConnectionState) => {
      setIsConnected(state.isConnected);
      setReconnectAttempts(state.reconnectAttempts);
    };

    stateSubscribers.add(updateState);
    return () => {
      stateSubscribers.delete(updateState);
    };
  }, []);

  const flushInvalidations = useCallback(() => {
    const keys = Array.from(pendingInvalidationsRef.current.values());
    if (keys.length === 0) return;

    // Clear pending set before invalidating so new messages can be collected concurrently
    pendingInvalidationsRef.current.clear();
    if (invalidateTimerRef.current) {
      clearTimeout(invalidateTimerRef.current);
      invalidateTimerRef.current = null;
    }

    let shouldInvalidateServicesHealth = false;
    const queryInvalidations = new Map<string, readonly unknown[]>();

    const addInvalidation = (queryKey: readonly unknown[]) => {
      const dedupKey = queryKey.join("|");
      queryInvalidations.set(dedupKey, queryKey);
    };

    // Keys are canonical backend service kinds. All per-service query
    // families ([kind, ...]) are invalidated via prefix matching, which
    // covers status/stats plus kind-specific families like
    // ["adguard","full"], ["tor","relay"], ["router","arp",...].
    keys.forEach((key) => {
      try {
        if (key === "metrics") {
          addInvalidation(queryKeys.metrics());
          return;
        }

        shouldInvalidateServicesHealth = true;
        addInvalidation(queryKeys.servicePrefix(key));
      } catch (e) {
        logger.warn("Failed to invalidate query", {
          key,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    });

    queryInvalidations.forEach((queryKey) => {
      queryClient.invalidateQueries({ queryKey });
    });

    if (shouldInvalidateServicesHealth) {
      try {
        queryClient.invalidateQueries({ queryKey: queryKeys.servicesHealth() });
      } catch (e) {
        logger.warn("Failed to invalidate services health query", {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    logger.debug("[WEBSOCKET] Flushed invalidations", {
      keys,
      invalidationFamilies: queryInvalidations.size,
    });
  }, [queryClient]);

  const scheduleInvalidationForKey = useCallback(
    (key: string) => {
      pendingInvalidationsRef.current.add(key);

      if (invalidateTimerRef.current) return;

      invalidateTimerRef.current = setTimeout(() => {
        flushInvalidations();
      }, INVALIDATION_DEBOUNCE_MS);
    },
    [flushInvalidations]
  );

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);

        publishWsEvent({
          type: message.type,
          service: message.service ?? message.kind,
          instanceId: message.instanceId,
          level: message.level,
          message: message.message,
          data: message.data,
          timestamp: message.timestamp,
        });

        switch (message.type) {
          case "connection":
            logger.debug("[WEBSOCKET] Server connection message", {
              message: message.message,
            });
            break;

          case "service_update": {
            // Batch/debounce invalidations to reduce rapid churn.
            // The broadcaster identifies services by kind + instanceId;
            // `service` is kept as a fallback for older frames.
            const key = message.kind ?? message.service;
            if (key) {
              scheduleInvalidationForKey(key);
            }
            break;
          }

          case "alert":
            logger.debug("[WEBSOCKET] Alert message received", {
              level: message.level,
              message: message.message,
            });
            if (message.level === "error") {
              toast.error(message.message || "Service alert");
            } else if (message.level === "warning") {
              toast.warning(message.message || "Service warning");
            } else {
              toast.info(message.message || "Service info");
            }
            break;

          case "metrics":
            // Treat metrics as a specific query key
            scheduleInvalidationForKey("metrics");
            break;

          case "service_config_changed":
            logger.debug("[WEBSOCKET] Service config changed", {
              kind: message.kind,
              instanceId: message.instanceId,
              action: message.action,
            });
            queryClient.invalidateQueries({
              queryKey: queryKeys.servicesInstances(),
            });
            queryClient.invalidateQueries({
              queryKey: queryKeys.servicesHealth(),
            });
            // Settings and the detail sheet read the stored rows; a change
            // made elsewhere (another window, an import) left them stale.
            queryClient.invalidateQueries({
              queryKey: queryKeys.configServices(),
            });
            queryClient.invalidateQueries({
              queryKey: queryKeys.configLoadErrors(),
            });
            break;

          case "profile_switched":
            // Active profile changed (often a network auto-switch) — refresh
            // profile state and the dashboard, since the monitored set changed.
            if (message.reason === "auto") {
              toast.info("Switched profile for the detected network");
            }
            queryClient.invalidateQueries({ queryKey: queryKeys.profiles() });
            queryClient.invalidateQueries({
              queryKey: queryKeys.activeProfile(),
            });
            queryClient.invalidateQueries({
              queryKey: queryKeys.currentNetwork(),
            });
            queryClient.invalidateQueries({
              queryKey: queryKeys.servicesInstances(),
            });
            queryClient.invalidateQueries({
              queryKey: queryKeys.servicesHealth(),
            });
            break;

          case "profile_network_unrecognized":
            // The current LAN matches no profile — refresh the hint source.
            queryClient.invalidateQueries({
              queryKey: queryKeys.currentNetwork(),
            });
            break;

          default:
            logger.warn("[WEBSOCKET] Unknown message type", { message });
        }
      } catch (error) {
        logger.error("[WEBSOCKET] Error parsing message", error);
      }
    },
    [scheduleInvalidationForKey, queryClient]
  );

  const scheduleReconnect = useCallback(() => {
    // Past MAX_RECONNECT_ATTEMPTS, tell the user once but keep retrying at
    // the capped delay, so live updates resume when the backend returns.
    if (globalConnectionState.reconnectAttempts === MAX_RECONNECT_ATTEMPTS) {
      logger.warn("[WEBSOCKET] Max reconnection attempts reached", {
        reconnectAttempts: globalConnectionState.reconnectAttempts,
      });
      toast.error("WebSocket connection failed after multiple attempts");
    }

    const delay = Math.min(
      INITIAL_RECONNECT_DELAY *
        Math.pow(2, globalConnectionState.reconnectAttempts),
      MAX_RECONNECT_DELAY
    );

    logger.debug("[WEBSOCKET] Scheduling reconnect", {
      attempt: globalConnectionState.reconnectAttempts + 1,
      delay,
    });

    // Replace (don't stack) any pending reconnect so a failure that fires
    // multiple socket events schedules exactly one retry.
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    reconnectTimeoutRef.current = setTimeout(() => {
      if (globalReconnectFn) {
        globalReconnectFn();
      }
    }, delay);
  }, []);

  const connect = useCallback(() => {
    // Check if already connected or connecting
    if (
      globalConnectionState.isConnected ||
      globalConnectionState.isConnecting
    ) {
      logger.debug("[WEBSOCKET] Connection skipped: already connected");
      return;
    }

    // Throttle connection attempts
    const now = Date.now();
    const elapsedMs = now - globalConnectionState.lastConnectionAttempt;
    if (elapsedMs < CONNECTION_THROTTLE_MS) {
      logger.debug("[WEBSOCKET] Connection throttled", {
        elapsedMs,
        minIntervalMs: CONNECTION_THROTTLE_MS,
      });
      // Defer rather than drop: a reconnect that lands inside the window
      // (backoff is 2s/4s, the window 5s) would otherwise never retry.
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      reconnectTimeoutRef.current = setTimeout(() => {
        if (globalReconnectFn) {
          globalReconnectFn();
        }
      }, CONNECTION_THROTTLE_MS - elapsedMs);
      return;
    }

    globalConnectionState.lastConnectionAttempt = now;
    globalConnectionState.isConnecting = true;
    notifyStateChange();

    try {
      logger.websocket("Creating WebSocket connection", { websocketUrl });

      globalWebSocket = new WebSocket(websocketUrl);

      globalWebSocket.onopen = () => {
        logger.websocket("WebSocket connection established");
        const wasReconnect = globalConnectionState.reconnectAttempts > 0;
        globalConnectionState.isConnected = true;
        globalConnectionState.isConnecting = false;
        globalConnectionState.reconnectAttempts = 0;
        notifyStateChange();
        // Only toast on recovery; a toast on every (re)connect is noise.
        if (wasReconnect) {
          toast.success("WebSocket reconnected");
          // Frames sent while disconnected are lost (e.g. the auto profile
          // switch after a network change, which itself drops the socket),
          // so refresh everything those frames would have invalidated.
          for (const queryKey of [
            queryKeys.profiles(),
            queryKeys.activeProfile(),
            queryKeys.currentNetwork(),
            queryKeys.servicesInstances(),
            queryKeys.servicesHealth(),
          ]) {
            queryClient.invalidateQueries({ queryKey });
          }
        }
      };

      globalWebSocket.onmessage = handleMessage;

      globalWebSocket.onclose = (event) => {
        logger.websocket("WebSocket connection closed", {
          code: event.code,
          reason: event.reason,
        });
        globalConnectionState.isConnected = false;
        globalConnectionState.isConnecting = false;
        globalWebSocket = null;
        notifyStateChange();

        // Only attempt reconnect if it wasn't a clean close
        if (event.code !== 1000) {
          globalConnectionState.reconnectAttempts++;
          notifyStateChange();
          scheduleReconnect();
        }
      };

      globalWebSocket.onerror = (error) => {
        // A failed connection fires onerror *and then* onclose; reconnect
        // accounting lives in onclose so each failure counts exactly once.
        logger.error("WebSocket error", error);
        globalConnectionState.isConnecting = false;
        notifyStateChange();
      };
    } catch (error) {
      logger.error("Error creating WebSocket", error);
      globalConnectionState.isConnecting = false;
      globalConnectionState.reconnectAttempts++;
      notifyStateChange();
      scheduleReconnect();
    }
  }, [websocketUrl, handleMessage, scheduleReconnect, queryClient]);

  // Set global reconnect function reference
  useEffect(() => {
    globalReconnectFn = connect;
    return () => {
      globalReconnectFn = null;
    };
  }, [connect]);

  const disconnect = useCallback(() => {
    logger.debug("[WEBSOCKET] Manual disconnect requested");

    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close connection
    if (globalWebSocket) {
      globalWebSocket.close(1000, "Manual disconnect");
      globalWebSocket = null;
    }

    // Reset state
    globalConnectionState.isConnected = false;
    globalConnectionState.isConnecting = false;
    globalConnectionState.reconnectAttempts = 0;
    notifyStateChange();
  }, []);

  const sendMessage = useCallback((message: unknown) => {
    if (globalWebSocket?.readyState === WebSocket.OPEN) {
      try {
        globalWebSocket.send(JSON.stringify(message));
        logger.debug("[WEBSOCKET] Message sent");
      } catch (error) {
        logger.error("[WEBSOCKET] Error sending message", error);
      }
    } else {
      logger.warn("[WEBSOCKET] Cannot send message: not connected");
    }
  }, []);

  // Initialize connection on mount
  useEffect(() => {
    connect();

    // Cleanup on unmount
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      // flush any pending invalidations on unmount
      if (invalidateTimerRef.current) {
        clearTimeout(invalidateTimerRef.current);
        invalidateTimerRef.current = null;
      }
      // Immediately flush any remaining invalidations
      flushInvalidations();
    };
  }, [connect, flushInvalidations]);

  return {
    isConnected,
    reconnectAttempts,
    sendMessage,
    disconnect,
    connect,
  };
};
