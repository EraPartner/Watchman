import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { useWebSocket } from "@/hooks/useWebSocket";

interface WebSocketContextValue {
  isConnected: boolean;
  reconnectAttempts: number;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

export interface WebSocketProviderProps {
  children: ReactNode;
}

/**
 * Mounts the singleton WebSocket exactly once and exposes connection state
 * to the React tree. Consumers should use `useWebSocketContext` for status
 * and `useWebSocketEvent` for raw event streams.
 */
export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const { isConnected, reconnectAttempts } = useWebSocket();

  const value = useMemo<WebSocketContextValue>(
    () => ({ isConnected, reconnectAttempts }),
    [isConnected, reconnectAttempts]
  );

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocketContext(): WebSocketContextValue {
  const ctx = useContext(WebSocketContext);
  if (!ctx) {
    return { isConnected: false, reconnectAttempts: 0 };
  }
  return ctx;
}
