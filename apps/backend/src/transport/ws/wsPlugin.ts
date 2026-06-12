import fp from "fastify-plugin";
import websocket from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import type { Logger } from "pino";
import { AuthGate } from "./AuthGate.js";
import { ConnectionManager } from "./ConnectionManager.js";
import { HeartbeatScheduler } from "./HeartbeatScheduler.js";
import { Broadcaster } from "./Broadcaster.js";
import type { WsClient, WsUpgradeRequest } from "./types.js";
import type { EventBus } from "../../core/eventBus.js";

export interface WsPluginOptions {
  bus: EventBus;
  logger: Logger;
  now: () => number;
  serverVersion: string;
  maxConnectionsPerIp?: number;
  heartbeatIntervalMs?: number;
  isOriginAllowed?: (origin: string | undefined) => boolean;
  extractToken?: (req: WsUpgradeRequest) => string | null;
  verifyToken?: (
    token: string
  ) => { username: string; sub?: string; id?: string } | null;
  requireToken?: boolean;
  path?: string;
}

// Browsers cannot set headers on a WebSocket handshake, so accept the token
// from the Authorization header (non-browser clients) or a ?token= query param.
function defaultExtractToken(req: WsUpgradeRequest): string | null {
  const auth = req.headers["authorization"];
  const header = Array.isArray(auth) ? auth[0] : auth;
  if (header && header.startsWith("Bearer ")) return header.slice(7);
  if (req.url) {
    try {
      const parsed = new URL(req.url, "http://placeholder");
      const token = parsed.searchParams.get("token");
      if (token) return token;
    } catch {
      // fall through
    }
  }
  return null;
}

function defaultVerifyToken(): { username: string } | null {
  return { username: "anonymous" };
}

export const wsPlugin = fp(
  async (app: FastifyInstance, opts: WsPluginOptions) => {
    await app.register(websocket);

    const gate = new AuthGate({
      extractToken: opts.extractToken ?? defaultExtractToken,
      verifyToken: opts.verifyToken ?? defaultVerifyToken,
      isOriginAllowed: opts.isOriginAllowed ?? (() => true),
      requireToken: opts.requireToken ?? false,
    });
    const manager = new ConnectionManager({
      maxConnectionsPerIp: opts.maxConnectionsPerIp ?? 10,
      now: opts.now,
    });
    const heartbeat = new HeartbeatScheduler({
      intervalMs: opts.heartbeatIntervalMs ?? 30_000,
      manager,
      setInterval: (fn, ms) => setInterval(fn, ms),
      clearInterval: (h) => clearInterval(h as NodeJS.Timeout),
      onError: (err) => opts.logger.warn({ err }, "ws heartbeat ping failed"),
    });
    const broadcaster = new Broadcaster({
      manager,
      bus: opts.bus,
      now: opts.now,
      onSendError: (err) => opts.logger.warn({ err }, "ws send failed"),
    });

    broadcaster.start();
    heartbeat.start();

    const path = opts.path ?? "/ws";
    app.get(path, { websocket: true }, (socket, req) => {
      const upgradeReq: WsUpgradeRequest = {
        headers: req.headers as Record<string, string | string[] | undefined>,
        url: req.url,
        socket: req.socket.remoteAddress
          ? { remoteAddress: req.socket.remoteAddress }
          : {},
      };

      if (!gate.isOriginAllowed(upgradeReq)) {
        socket.close(1008, "origin_not_allowed");
        return;
      }
      const auth = gate.authenticate(upgradeReq);
      if (!auth.ok) {
        socket.close(1008, auth.reason);
        return;
      }

      const ws = socket as unknown as WsClient;
      const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
      const result = manager.add(ws, ip, auth.user);
      if (!result.ok) {
        socket.close(1013, result.reason);
        return;
      }

      broadcaster.welcome(ws, opts.serverVersion);

      ws.on("pong", () => manager.markAlive(ws));
      ws.on("close", () => manager.remove(ws));
      ws.on("error", (err) => opts.logger.warn({ err }, "ws client error"));
    });

    app.addHook("onClose", async () => {
      heartbeat.stop();
      broadcaster.stop();
      for (const [ws] of manager.entries()) {
        try {
          ws.close(1001, "server_shutdown");
        } catch {
          /* noop */
        }
      }
      manager.clear();
    });
  }
);
