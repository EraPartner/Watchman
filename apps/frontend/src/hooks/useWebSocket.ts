import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

interface WebSocketMessage {
  type: "connection" | "service_update" | "alert" | "metrics";
  service?: string;
  data?: any;
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
    globalConnectionState.isConnected,
  );
  const [reconnectAttempts, setReconnectAttempts] = useState(
    globalConnectionState.reconnectAttempts,
  );
  const queryClient = useQueryClient();
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
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

    // Invalidate each key once
    keys.forEach((key) => {
      try {
        queryClient.invalidateQueries({ queryKey: [key] });
      } catch (e) {
        console.warn(
          "⚠️ Failed to invalidate query",
          key,
          e && (e as Error).message,
        );
      }
    });

    // Also invalidate 'metrics' if it's part of the keys set but ensure it's handled as its own query key
    if (keys.includes("metrics")) {
      try {
        queryClient.invalidateQueries({ queryKey: ["metrics"] });
      } catch (e) {
        console.warn(
          "⚠️ Failed to invalidate metrics query",
          e && (e as Error).message,
        );
      }
    }

    console.debug("📡 Flushed invalidations for keys:", keys);
  }, [queryClient]);

  const scheduleInvalidationForKey = useCallback(
    (key: string) => {
      pendingInvalidationsRef.current.add(key);

      if (invalidateTimerRef.current) return;

      invalidateTimerRef.current = setTimeout(() => {
        flushInvalidations();
      }, INVALIDATION_DEBOUNCE_MS);
    },
    [flushInvalidations],
  );

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      try {
        const message: WebSocketMessage = JSON.parse(event.data);

        switch (message.type) {
          case "connection":
            console.log("📡 WebSocket connected:", message.message);
            toast.success("WebSocket connected");
            break;

          case "service_update":
            console.log("📡 Service update:", message.service, message.data);
            // Batch/debounce invalidations to reduce rapid churn
            if (message.service) {
              scheduleInvalidationForKey(message.service);
            }
            break;

          case "alert":
            console.log("📡 Alert:", message.message);
            if (message.level === "error") {
              toast.error(message.message || "Service alert");
            } else if (message.level === "warning") {
              toast.warning(message.message || "Service warning");
            } else {
              toast.info(message.message || "Service info");
            }
            break;

          case "metrics":
            console.log("📡 Metrics update:", message.data);
            // Treat metrics as a specific query key
            scheduleInvalidationForKey("metrics");
            break;

          default:
            console.log("📡 Unknown message type:", message);
        }
      } catch (error) {
        console.error("📡 Error parsing WebSocket message:", error);
      }
    },
    [scheduleInvalidationForKey],
  );

  const scheduleReconnect = useCallback(() => {
    if (globalConnectionState.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.log("📡 Max reconnection attempts reached");
      toast.error("WebSocket connection failed after multiple attempts");
      return;
    }

    const delay = Math.min(
      INITIAL_RECONNECT_DELAY *
        Math.pow(2, globalConnectionState.reconnectAttempts),
      MAX_RECONNECT_DELAY,
    );

    console.log(
      `📡 Scheduling reconnect attempt ${
        globalConnectionState.reconnectAttempts + 1
      } in ${delay}ms`,
    );

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
      console.log("📡 WebSocket already connected or connecting");
      return;
    }

    // Throttle connection attempts
    const now = Date.now();
    if (
      now - globalConnectionState.lastConnectionAttempt <
      CONNECTION_THROTTLE_MS
    ) {
      console.log("📡 Connection throttled - too soon since last attempt");
      return;
    }

    globalConnectionState.lastConnectionAttempt = now;
    globalConnectionState.isConnecting = true;
    notifyStateChange();

    try {
      console.log("📡 Creating WebSocket connection:", websocketUrl);

      globalWebSocket = new WebSocket(websocketUrl);

      globalWebSocket.onopen = () => {
        console.log("📡 WebSocket connection established");
        globalConnectionState.isConnected = true;
        globalConnectionState.isConnecting = false;
        globalConnectionState.reconnectAttempts = 0;
        notifyStateChange();
      };

      globalWebSocket.onmessage = handleMessage;

      globalWebSocket.onclose = (event) => {
        console.log(
          "📡 WebSocket connection closed:",
          event.code,
          event.reason,
        );
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
        console.error("📡 WebSocket error:", error);
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
      console.error("📡 Error creating WebSocket:", error);
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
    console.log("📡 Manually disconnecting WebSocket");

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

  const sendMessage = useCallback((message: any) => {
    if (globalWebSocket?.readyState === WebSocket.OPEN) {
      try {
        globalWebSocket.send(JSON.stringify(message));
        console.log("📡 Message sent:", message);
      } catch (error) {
        console.error("📡 Error sending message:", error);
      }
    } else {
      console.warn("📡 Cannot send message - WebSocket not connected");
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
      if (pendingInvalidationsRef.current.size > 0) {
        flushInvalidations();
      }
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
