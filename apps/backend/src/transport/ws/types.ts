export const WS_OPEN = 1;

export interface WsClient {
  readyState: number;
  send(data: string): void;
  ping(): void;
  terminate(): void;
  close(code?: number, reason?: string): void;
  on(event: 'pong' | 'message' | 'close' | 'error', cb: (...args: unknown[]) => void): void;
}

export interface WsUpgradeRequest {
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
  connection?: { remoteAddress?: string };
}

export interface AuthUser {
  username: string;
  id?: string;
}

export interface ClientMeta {
  user: AuthUser;
  ip: string;
  connectedAt: number;
  alive: boolean;
}
