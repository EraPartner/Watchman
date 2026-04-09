import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { logger } from "../lib/logger";
import { queryKeys } from "../lib/queryKeys";

interface WebSocketMessage {
  type: "connection" | "service_update" | "alert" | "metrics";
  service?: string;
  data?: unknown;
  level?: "info" | "warning" | "error";
  message?: string;
  timestamp: string;
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
  const websocketUrl = url || "ws://localhost:3001/ws";

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

    // Collect affected query families first to avoid duplicate invalidations
    keys.forEach((key) => {
      try {
        if (key === "metrics") {
          addInvalidation(queryKeys.metrics());
          return;
        }

        shouldInvalidateServicesHealth = true;

        const keyParts = key.split("_");
        const baseServiceKey = keyParts.length > 1 ? keyParts[0] : key;

        addInvalidation(queryKeys.servicePrefix(baseServiceKey));

        if (key !== baseServiceKey) {
          addInvalidation(queryKeys.servicePrefix(key));
        }

        if (baseServiceKey === "adguard") {
          addInvalidation(queryKeys.adguardFull());
        }

        if (baseServiceKey === "tor") {
          addInvalidation(queryKeys.torRelay());
        }

        // Router ARP keys are namespaced under ["router", "arp", serviceKey]
        if (baseServiceKey === "beryl" || baseServiceKey === "telenet") {
          addInvalidation(queryKeys.routerArp(baseServiceKey));
        }
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

        switch (message.type) {
          case "connection":
            logger.debug("[WEBSOCKET] Server connection message", {
              message: message.message,
            });
            toast.success("WebSocket connected");
            break;

          case "service_update":
            // Batch/debounce invalidations to reduce rapid churn
            if (message.service) {
              scheduleInvalidationForKey(message.service);
            }
            break;

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

          default:
            logger.warn("[WEBSOCKET] Unknown message type", { message });
        }
      } catch (error) {
        logger.error("[WEBSOCKET] Error parsing message", error);
      }
    },
    [scheduleInvalidationForKey]
  );

  const scheduleReconnect = useCallback(() => {
    if (globalConnectionState.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      logger.warn("[WEBSOCKET] Max reconnection attempts reached", {
        reconnectAttempts: globalConnectionState.reconnectAttempts,
      });
      toast.error("WebSocket connection failed after multiple attempts");
      return;
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
    if (
      now - globalConnectionState.lastConnectionAttempt <
      CONNECTION_THROTTLE_MS
    ) {
      logger.debug("[WEBSOCKET] Connection throttled", {
        elapsedMs: now - globalConnectionState.lastConnectionAttempt,
        minIntervalMs: CONNECTION_THROTTLE_MS,
      });
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
        globalConnectionState.isConnected = true;
        globalConnectionState.isConnecting = false;
        globalConnectionState.reconnectAttempts = 0;
        notifyStateChange();
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
        if (
          event.code !== 1000 &&
          globalConnectionState.reconnectAttempts < MAX_RECONNECT_ATTEMPTS
        ) {
          globalConnectionState.reconnectAttempts++;
          notifyStateChange();
          scheduleReconnect();
        }
      };

      globalWebSocket.onerror = (error) => {
        logger.error("WebSocket error", error);
        globalConnectionState.isConnecting = false;
        notifyStateChange();

        if (globalWebSocket?.readyState === WebSocket.CONNECTING) {
          // Connection failed during setup
          globalConnectionState.reconnectAttempts++;
          notifyStateChange();
          scheduleReconnect();
        }
      };
    } catch (error) {
      logger.error("Error creating WebSocket", error);
      globalConnectionState.isConnecting = false;
      globalConnectionState.reconnectAttempts++;
      notifyStateChange();
      scheduleReconnect();
    }
  }, [websocketUrl, handleMessage, scheduleReconnect]);

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
