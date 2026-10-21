import { createRequire } from "module";
import type {
  RoonConnectFn,
  RoonConnectOptions,
  RoonHandle,
  RoonZone,
} from "./roonClient.js";

const _require = createRequire(import.meta.url);

// The Roon SDK's transport-websocket.js polyfills `global.WebSocket = require('ws')`
// only when WebSocket is undefined. Node 22+ exposes a native WHATWG `WebSocket`
// (no `.on('pong')`, no `.terminate()`, no `.ping()`), so the polyfill is skipped
// and the SDK throws `this.ws.on is not a function`. Force the global to `ws` —
// it's the long-standing Node WS lib and is a superset of the WHATWG API, so
// other call sites that use `addEventListener` keep working.
(globalThis as { WebSocket?: unknown }).WebSocket = _require("ws");

// ─── Minimal types for @roonlabs/node-roon-api (no @types package) ───────────

export interface RoonApiOptions {
  extension_id: string;
  display_name: string;
  display_version: string;
  publisher: string;
  email: string;
  log_level?: string;
  core_paired?: (core: RoonCore) => void;
  core_unpaired?: (core: RoonCore) => void;
}

export interface RoonCore {
  core_id: string;
  display_name: string;
  moo: {
    _subscribe_helper(
      svcname: string,
      reqname: string,
      cb: (cmd: string | false, body: unknown) => void
    ): { unsubscribe: (cb?: () => void) => void };
    transport: { close(): void };
  };
}

export interface RoonMooTransport {
  transport: { close(): void };
}

export interface RoonApiInstance {
  init_services(opts: {
    required_services?: unknown[];
    optional_services?: unknown[];
    provided_services?: unknown[];
  }): void;
  ws_connect(opts: {
    host: string;
    port: number;
    onclose?: () => void;
    onerror?: () => void;
  }): RoonMooTransport;
}

export type RoonApiConstructor = new (opts: RoonApiOptions) => RoonApiInstance;

const RoonApiCtor = _require("@roonlabs/node-roon-api") as RoonApiConstructor;
// The Core only grants services an extension declares at registration; without
// this, the transport "zones" subscription below never receives zone data.
const RoonApiTransport = _require("node-roon-api-transport") as unknown;

// ─── Raw zone shape from Roon transport:2 subscription ───────────────────────

interface RoonZoneRaw {
  zone_id: string;
  display_name: string;
  state: string;
  queue_items_remaining?: number;
  queue_time_remaining?: number;
  now_playing?: {
    one_line?: { line1?: string };
    seek_position?: number;
    length?: number;
  };
  outputs?: unknown[];
}

interface ZonesBody {
  zones?: RoonZoneRaw[];
  zones_changed?: RoonZoneRaw[];
  zones_added?: RoonZoneRaw[];
  zones_removed?: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_STATES = new Set(["playing", "paused", "loading", "stopped"]);

function normaliseState(raw: string): RoonZone["state"] {
  return VALID_STATES.has(raw) ? (raw as RoonZone["state"]) : "stopped";
}

function parseZone(raw: RoonZoneRaw): RoonZone {
  const nowPlaying = raw.now_playing
    ? {
        oneLine: raw.now_playing.one_line?.line1 ?? "",
        ...(raw.now_playing.seek_position !== undefined
          ? { seekPosition: raw.now_playing.seek_position }
          : {}),
        ...(raw.now_playing.length !== undefined
          ? { length: raw.now_playing.length }
          : {}),
      }
    : undefined;

  return {
    zoneId: raw.zone_id,
    displayName: raw.display_name,
    state: normaliseState(raw.state),
    queueItemsRemaining: raw.queue_items_remaining ?? 0,
    queueTimeRemaining: raw.queue_time_remaining ?? 0,
    ...(nowPlaying !== undefined ? { nowPlaying } : {}),
    outputCount: Array.isArray(raw.outputs) ? raw.outputs.length : 0,
  };
}

function applyZoneUpdate(
  cmd: string | false,
  body: ZonesBody,
  zones: Map<string, RoonZone>
): void {
  if (cmd === "Subscribed") {
    zones.clear();
    for (const z of body.zones ?? []) zones.set(z.zone_id, parseZone(z));
    return;
  }
  if (cmd !== "Changed") return;
  for (const z of body.zones_added ?? []) zones.set(z.zone_id, parseZone(z));
  for (const z of body.zones_changed ?? []) zones.set(z.zone_id, parseZone(z));
  for (const id of body.zones_removed ?? []) zones.delete(id);
}

// ─── Public implementation ────────────────────────────────────────────────────

export interface RoonConnectDeps {
  RoonApi: RoonApiConstructor;
  /** First reconnect delay after the Core connection drops (doubles up to maxReconnectDelayMs). */
  reconnectDelayMs?: number;
  maxReconnectDelayMs?: number;
}

/**
 * Build a RoonConnectFn around a node-roon-api constructor.
 *
 * The promise resolves immediately after initiating the connection.
 * Pairing (and therefore zone data) arrives asynchronously:
 * `handle.isPaired()` starts false and becomes true once the Roon UI
 * approves the extension (first time) or the saved token is accepted
 * (subsequent restarts).
 *
 * node-roon-api's `ws_connect` never reconnects by itself (its transport
 * fires `onclose` only for a connection that had opened, and `onerror` for
 * one that never did), so the handle reconnects with backoff until closed.
 */
export function createRoonConnect(deps: RoonConnectDeps): RoonConnectFn {
  const baseDelay = deps.reconnectDelayMs ?? 5_000;
  const maxDelay = deps.maxReconnectDelayMs ?? 60_000;

  return (opts: RoonConnectOptions): Promise<RoonHandle> => {
    const zones = new Map<string, RoonZone>();
    let paired = false;
    let closed = false;
    let subscription: { unsubscribe: (cb?: () => void) => void } | undefined;
    let mooTransportRef: { close(): void } | undefined;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let delay = baseDelay;

    const dropSubscription = (): void => {
      try {
        subscription?.unsubscribe();
      } catch {
        /* ignore */
      }
      subscription = undefined;
    };

    const roon = new deps.RoonApi({
      extension_id: opts.extensionId,
      display_name: opts.displayName,
      display_version: "1.0.0",
      publisher: "Watchman",
      email: "watchman@localhost",
      log_level: "none",

      core_paired(core: RoonCore): void {
        paired = true;
        delay = baseDelay;
        subscription = core.moo._subscribe_helper(
          "com.roonlabs.transport:2",
          "zones",
          (cmd, body) => {
            applyZoneUpdate(cmd, body as ZonesBody, zones);
            opts.onZonesChanged?.(Array.from(zones.values()));
          }
        );
      },

      core_unpaired(_core: RoonCore): void {
        paired = false;
        dropSubscription();
        zones.clear();
        opts.onZonesChanged?.([]);
      },
    });

    roon.init_services({
      required_services: [RoonApiTransport],
      optional_services: [],
      provided_services: [],
    });

    const onConnectionLost = (): void => {
      const hadState = paired || zones.size > 0;
      paired = false;
      subscription = undefined;
      zones.clear();
      if (hadState) opts.onZonesChanged?.([]);
      if (closed || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        if (!closed) connect();
      }, delay);
      delay = Math.min(delay * 2, maxDelay);
    };

    let generation = 0;
    const connect = (): void => {
      const gen = ++generation;
      try {
        mooTransportRef?.close();
      } catch {
        /* ignore */
      }
      // callbacks from a superseded transport must not trigger another reconnect
      const lost = (): void => {
        if (gen === generation) onConnectionLost();
      };
      const moo = roon.ws_connect({
        host: opts.host,
        port: opts.port,
        onclose: lost,
        onerror: lost,
      });
      mooTransportRef = moo.transport;
    };

    connect();

    const handle: RoonHandle = {
      getZones: () => Array.from(zones.values()),
      isPaired: () => paired,
      close: async (): Promise<void> => {
        closed = true;
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
        dropSubscription();
        try {
          mooTransportRef?.close();
        } catch {
          /* ignore */
        }
        zones.clear();
        paired = false;
      },
    };

    return Promise.resolve(handle);
  };
}

export const roonConnect: RoonConnectFn = createRoonConnect({ RoonApi: RoonApiCtor });
