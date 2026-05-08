/** A single zone reported by the Roon transport service. */
export interface RoonZone {
  zoneId: string;
  displayName: string;
  state: 'playing' | 'paused' | 'loading' | 'stopped';
  queueItemsRemaining: number;
  queueTimeRemaining: number;
  nowPlaying?: {
    oneLine: string;
    seekPosition?: number;
    length?: number;
  };
  outputCount: number;
}

/** Handle for an active Roon Core connection. */
export interface RoonHandle {
  /** Snapshot of all known zones at this moment. */
  getZones(): ReadonlyArray<RoonZone>;
  /** True when the extension is currently paired to a Roon Core. */
  isPaired(): boolean;
  /** Close the connection and release resources. */
  close(): Promise<void>;
}

export interface RoonConnectOptions {
  host: string;
  port: number;
  extensionId: string;
  displayName: string;
  /** Called whenever the zone list changes (pair/unpair/play/stop). */
  onZonesChanged?: (zones: ReadonlyArray<RoonZone>) => void;
}

/**
 * Opens a WebSocket connection to a Roon Core and returns a handle.
 * Resolves as soon as the connection attempt is initiated; pairing
 * (and zone data) arrive asynchronously via the `core_paired` callback.
 *
 * Real implementation: `roonConnect` from `./roonClientImpl.js`.
 * Fake implementation: test-local stub.
 */
export type RoonConnectFn = (opts: RoonConnectOptions) => Promise<RoonHandle>;
