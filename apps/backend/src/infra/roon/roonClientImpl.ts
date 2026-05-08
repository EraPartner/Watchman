import { createRequire } from 'module';
import type { RoonConnectFn, RoonConnectOptions, RoonHandle, RoonZone } from './roonClient.js';

const _require = createRequire(import.meta.url);

// ─── Minimal types for @roonlabs/node-roon-api (no @types package) ───────────

interface RoonApiOptions {
  extension_id: string;
  display_name: string;
  display_version: string;
  publisher: string;
  email: string;
  log_level?: string;
  core_paired?: (core: RoonCore) => void;
  core_unpaired?: (core: RoonCore) => void;
}

interface RoonCore {
  core_id: string;
  display_name: string;
  moo: {
    _subscribe_helper(
      svcname: string,
      reqname: string,
      cb: (cmd: string | false, body: unknown) => void,
    ): { unsubscribe: (cb?: () => void) => void };
    transport: { close(): void };
  };
}

interface RoonMooTransport {
  transport: { close(): void };
}

interface RoonApiInstance {
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

type RoonApiConstructor = new (opts: RoonApiOptions) => RoonApiInstance;

// eslint-disable-next-line @typescript-eslint/no-require-imports
const RoonApiCtor = _require('@roonlabs/node-roon-api') as RoonApiConstructor;

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

const VALID_STATES = new Set(['playing', 'paused', 'loading', 'stopped']);

function normaliseState(raw: string): RoonZone['state'] {
  return VALID_STATES.has(raw) ? (raw as RoonZone['state']) : 'stopped';
}

function parseZone(raw: RoonZoneRaw): RoonZone {
  const nowPlaying = raw.now_playing
    ? {
        oneLine: raw.now_playing.one_line?.line1 ?? '',
        ...(raw.now_playing.seek_position !== undefined
          ? { seekPosition: raw.now_playing.seek_position }
          : {}),
        ...(raw.now_playing.length !== undefined ? { length: raw.now_playing.length } : {}),
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
  zones: Map<string, RoonZone>,
): void {
  if (cmd === 'Subscribed') {
    zones.clear();
    for (const z of body.zones ?? []) zones.set(z.zone_id, parseZone(z));
    return;
  }
  if (cmd !== 'Changed') return;
  for (const z of body.zones_added ?? []) zones.set(z.zone_id, parseZone(z));
  for (const z of body.zones_changed ?? []) zones.set(z.zone_id, parseZone(z));
  for (const id of body.zones_removed ?? []) zones.delete(id);
}

// ─── Public implementation ────────────────────────────────────────────────────

/**
 * Connect to a Roon Core at `opts.host:opts.port` using the
 * `@roonlabs/node-roon-api` library.
 *
 * The promise resolves immediately after initiating the connection.
 * Pairing (and therefore zone data) arrives asynchronously:
 * `handle.isPaired()` starts false and becomes true once the Roon UI
 * approves the extension (first time) or the saved token is accepted
 * (subsequent restarts).
 */
export const roonConnect: RoonConnectFn = (opts: RoonConnectOptions): Promise<RoonHandle> => {
  const zones = new Map<string, RoonZone>();
  let paired = false;
  let subscription: { unsubscribe: (cb?: () => void) => void } | undefined;
  let mooTransportRef: { close(): void } | undefined;

  const roon = new RoonApiCtor({
    extension_id: opts.extensionId,
    display_name: opts.displayName,
    display_version: '1.0.0',
    publisher: 'Watchman',
    email: 'watchman@localhost',
    log_level: 'none',

    core_paired(core: RoonCore): void {
      paired = true;
      subscription = core.moo._subscribe_helper(
        'com.roonlabs.transport:2',
        'zones',
        (cmd, body) => {
          applyZoneUpdate(cmd, body as ZonesBody, zones);
          opts.onZonesChanged?.(Array.from(zones.values()));
        },
      );
    },

    core_unpaired(_core: RoonCore): void {
      paired = false;
      try {
        subscription?.unsubscribe();
      } catch {
        /* ignore */
      }
      subscription = undefined;
      zones.clear();
      opts.onZonesChanged?.([]);
    },
  });

  roon.init_services({ required_services: [], optional_services: [], provided_services: [] });

  const moo = roon.ws_connect({
    host: opts.host,
    port: opts.port,
    onclose() {
      paired = false;
      zones.clear();
    },
  });

  mooTransportRef = moo.transport;

  const handle: RoonHandle = {
    getZones: () => Array.from(zones.values()),
    isPaired: () => paired,
    close: async (): Promise<void> => {
      try {
        subscription?.unsubscribe();
      } catch {
        /* ignore */
      }
      subscription = undefined;
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
