import { createRequire } from "module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
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
  /** Without these, node-roon-api reads and writes ./config.json in the cwd. */
  get_persisted_state?: () => unknown;
  set_persisted_state?: (state: unknown) => void;
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

/**
 * Where the pairing state (the Core's token for this extension) is kept.
 * Keyed per Core address so two Roon instances don't overwrite each other.
 */
export interface RoonStateStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

/**
 * JSON file store for Roon pairing state, written with mode 0600. Without it
 * node-roon-api writes the token to ./config.json in the process cwd: an
 * untracked secret in a dev checkout, or silently lost on a read-only cwd so
 * every restart asks the user to enable the extension again.
 *
 * A key with no entry falls back (read-only) to the "roonstate" that older
 * versions left in `legacyPath`, so existing pairings keep working.
 */
export function createFileRoonStateStore(
  path: string,
  legacyPath = resolve(process.cwd(), "config.json")
): RoonStateStore {
  const readJson = (file: string): Record<string, unknown> => {
    try {
      const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
      return parsed && typeof parsed === "object"
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  };
  return {
    get(key) {
      const value = readJson(path)[key];
      if (value !== undefined) return value;
      return readJson(legacyPath)["roonstate"];
    },
    set(key, value) {
      const all = readJson(path);
      all[key] = value;
      try {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, JSON.stringify(all, null, 2), { mode: 0o600 });
      } catch {
        // same as node-roon-api: losing the token only means re-pairing
      }
    },
  };
}

export interface RoonConnectDeps {
  RoonApi: RoonApiConstructor;
  /** Pairing-state store; see createFileRoonStateStore. */
  stateStore?: RoonStateStore;
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

    const stateStore = deps.stateStore;
    const stateKey = `${opts.host}:${opts.port}`;
    const roon = new deps.RoonApi({
      extension_id: opts.extensionId,
      display_name: opts.displayName,
      display_version: "1.0.0",
      publisher: "Watchman",
      email: "watchman@localhost",
      log_level: "none",
      ...(stateStore
        ? {
            get_persisted_state: () => stateStore.get(stateKey) ?? {},
            set_persisted_state: (state: unknown) =>
              stateStore.set(stateKey, state),
          }
        : {}),

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

/** The real connector, keeping pairing state in `stateFile` (under DATA_DIR). */
export function createDefaultRoonConnect(stateFile: string): RoonConnectFn {
  return createRoonConnect({
    RoonApi: RoonApiCtor,
    stateStore: createFileRoonStateStore(stateFile),
  });
}
