import {
  BaseService,
  type HealthResult,
  type HostHealth,
  type PollPolicy,
  type StatsResult,
} from "../../BaseService.js";
import { ok, err } from "../../../core/result.js";
import { UnauthorizedError, UnavailableError } from "../../../core/errors.js";
import { ttlMemo, type TtlMemo } from "../../../core/ttlMemo.js";
import type { PhilipsBridgeInstance } from "../../../config/services.js";
import type { PingProber } from "../../../infra/net/pingProbe.js";
import type { HttpClient } from "../../../infra/http/client.js";
import {
  createPinnedClient,
  createPinnedDispatcher,
} from "../../../infra/http/pinnedClient.js";
import {
  isCredentialRejection,
  startSseStream,
  type SseStarter,
} from "../../../infra/http/sseClient.js";
import type { Dispatcher } from "undici";

const HUE_API_BASE = "/clip/v2";
const EVENTSTREAM_PATH = "/eventstream/clip/v2";

// inventory/connectivity/battery resources change rarely — slow lane
const RESOURCE_TTL_MS = 5 * 60 * 1000;
const LOW_BATTERY_THRESHOLD = 20;
const KEY_REJECTED_MESSAGE = "application key rejected — re-pair the bridge";
// The bridge's certificate is self-signed; without the fingerprint pairing
// stores, the verifying client refuses it and no API call can succeed.
const NO_PIN_MESSAGE =
  "no certificate fingerprint stored — re-pair the bridge so Watchman can trust its certificate";
/** Longest device list kept in a snapshot. */
const MAX_LISTED_DEVICES = 20;

/** The bridge answers 401/403 for an unknown or revoked application key. */
function isKeyRejected(status: number): boolean {
  return status === 401 || status === 403;
}

interface HueLight {
  id: string;
  type: string;
  on?: { on: boolean };
  metadata?: { name?: string };
}

interface HueResource {
  id: string;
  type?: string;
  status?: string;
  power_state?: { battery_state?: string; battery_level?: number };
  on?: { on: boolean };
  /** zigbee_connectivity / device_power point at their device */
  owner?: { rid?: string; rtype?: string };
  /** device resources carry the user-facing name and model */
  metadata?: { name?: string };
  product_data?: { product_name?: string; model_id?: string };
}

interface HueListResponse<T> {
  errors?: unknown[];
  data?: T[];
}

interface HueSseEnvelope {
  type?: string;
  data?: HueResource[];
}

export interface PhilipsBridgeDeps {
  ping: PingProber;
  http: HttpClient;
  config: PhilipsBridgeInstance;
  now: () => number;
  /** SSE starter, injectable for tests (defaults to the real stream). */
  sse?: SseStarter;
}

export class PhilipsBridgeService extends BaseService {
  readonly kind = "philipsBridge";
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;
  private readonly host: string;
  private readonly timeoutMs: number;
  private readonly pingCount: number;
  private readonly usePing: boolean;
  private readonly applicationKey: string | undefined;
  private readonly pinned: boolean;
  private readonly pinger: PingProber;
  private readonly http: HttpClient;
  private readonly now: () => number;
  private readonly sse: SseStarter;
  private readonly sseDispatcher: Dispatcher | undefined;
  private readonly connectivityMemo: TtlMemo<HueResource[]>;
  private readonly powerMemo: TtlMemo<HueResource[]>;
  private readonly deviceMemo: TtlMemo<HueResource[]>;
  private readonly roomMemo: TtlMemo<HueResource[]>;

  // live light state pushed via the bridge eventstream (id -> on)
  private readonly liveLightOn = new Map<string, boolean>();
  // true once a full /resource/light fetch has seeded liveLightOn; SSE
  // updates alone carry only changed lights, so they can't stand in for it
  private lightsSeeded = false;
  private sseAbort: AbortController | undefined;
  private sseHealthy = false;
  private sseKeyRejected = false;
  private lastEventAt = 0;

  constructor(deps: PhilipsBridgeDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.host = deps.config.host;
    this.timeoutMs = deps.config.timeoutMs;
    this.pingCount = deps.config.pingCount;
    this.usePing = deps.config.usePing;
    this.applicationKey = deps.config.applicationKey;
    this.pinned = Boolean(deps.config.certHash);
    this.now = deps.now;
    this.pinger = deps.ping;
    this.http = deps.config.certHash
      ? createPinnedClient(deps.config.certHash)
      : deps.http;
    this.sse = deps.sse ?? startSseStream;
    this.sseDispatcher = deps.config.certHash
      ? createPinnedDispatcher(deps.config.certHash)
      : undefined;
    const resource = (path: string): TtlMemo<HueResource[]> =>
      ttlMemo(RESOURCE_TTL_MS, deps.now, (signal) =>
        this.fetchResource(path, signal)
      );
    this.connectivityMemo = resource("/resource/zigbee_connectivity");
    this.powerMemo = resource("/resource/device_power");
    this.deviceMemo = resource("/resource/device");
    this.roomMemo = resource("/resource/room");
  }

  override async onStart(): Promise<void> {
    if (!this.applicationKey) return;
    // the bridge pushes every state change over SSE — light state stays
    // fresh between polls without re-fetching the light list
    this.sseAbort = new AbortController();
    this.sse({
      url: `https://${this.host}${EVENTSTREAM_PATH}`,
      headers: { "hue-application-key": this.applicationKey },
      ...(this.sseDispatcher ? { dispatcher: this.sseDispatcher } : {}),
      signal: this.sseAbort.signal,
      onMessage: (data) => this.handleSseMessage(data),
      onError: (e) => {
        // events may be missed until the stream recovers — re-seed on next poll
        this.sseHealthy = false;
        this.lightsSeeded = false;
        // the stream gives up on a refused key; health keeps reporting it
        if (isCredentialRejection(e)) this.sseKeyRejected = true;
      },
    });
  }

  override async onStop(): Promise<void> {
    this.sseAbort?.abort();
    this.sseAbort = undefined;
    this.sseHealthy = false;
  }

  private handleSseMessage(data: string): void {
    let envelopes: HueSseEnvelope[];
    try {
      const parsed: unknown = JSON.parse(data);
      envelopes = Array.isArray(parsed) ? (parsed as HueSseEnvelope[]) : [];
    } catch {
      return;
    }
    // the stream was down (or not yet up): a light list fetched meanwhile
    // can miss changes made before the stream (re)connected, so re-seed
    if (!this.sseHealthy) this.lightsSeeded = false;
    this.sseHealthy = true;
    this.lastEventAt = this.now();
    for (const envelope of envelopes) {
      for (const item of envelope.data ?? []) {
        if (item.type !== "light" || !item.id) continue;
        if (envelope.type === "delete") this.liveLightOn.delete(item.id);
        else if (item.on !== undefined) this.liveLightOn.set(item.id, item.on.on);
      }
    }
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    const pingStarted = this.now();
    const pingRes = this.usePing
      ? await this.pinger.probe({
          host: this.host,
          timeoutMs: this.timeoutMs,
          count: this.pingCount,
          signal,
        })
      : { success: false, avgMs: undefined };
    const pingElapsedMs = this.now() - pingStarted;
    const icmpAlive = this.usePing && pingRes.success;
    const host: HostHealth = {
      reachable: icmpAlive,
      ...(pingRes.avgMs !== undefined ? { pingMs: pingRes.avgMs } : {}),
    };

    if (!this.applicationKey) {
      const latencyMs = pingRes.avgMs ?? pingElapsedMs;
      return ok({
        reachable: icmpAlive,
        latencyMs,
        at: this.now(),
        host,
        details: { host: this.host, icmpAlive, pingEnabled: this.usePing },
      });
    }

    const apiStarted = this.now();
    const probe = await this.probeApi(signal);
    const apiReachable = probe.reachable;
    const apiLatencyMs = this.now() - apiStarted;
    const message = probe.keyRejected
      ? KEY_REJECTED_MESSAGE
      : !apiReachable && !this.pinned
        ? NO_PIN_MESSAGE
        : undefined;
    const service = {
      reachable: apiReachable,
      ...(apiReachable ? { latencyMs: apiLatencyMs } : {}),
      ...(message !== undefined ? { message } : {}),
      details: { apiV2: true },
    };
    // the API round trip is the service latency; ping is the fallback
    const latencyMs = apiReachable
      ? apiLatencyMs
      : (pingRes.avgMs ?? pingElapsedMs);
    // With a key configured, the bridge counts as up only when its API
    // answers (ADR-026: the protocol probe is the defining signal). A bridge
    // that answers ping but refuses the key or the TLS handshake is not
    // usable, and used to show green.
    const reachable = service.reachable;

    return ok({
      reachable,
      latencyMs,
      at: this.now(),
      host,
      service,
      ...(message !== undefined ? { message } : {}),
      details: {
        host: this.host,
        icmpAlive,
        apiReachable,
        pingEnabled: this.usePing,
        sseConnected: this.sseHealthy,
        ...(this.sseKeyRejected ? { sseStopped: true } : {}),
      },
    });
  }

  async getStats(signal: AbortSignal): Promise<StatsResult> {
    const base = { host: this.host, configured: Boolean(this.host) };

    if (!this.applicationKey) {
      return ok({ at: this.now(), metrics: base });
    }

    const settled = await Promise.allSettled([
      this.lightCounts(signal),
      this.connectivityMemo(signal),
      this.powerMemo(signal),
      this.deviceMemo(signal),
      this.roomMemo(signal),
    ]);
    // a rejected application key is not "no data": every read will fail
    // until the bridge is re-paired
    const keyRejected = settled.find(
      (r): r is PromiseRejectedResult =>
        r.status === "rejected" && r.reason instanceof UnauthorizedError
    );
    if (keyRejected) return err(keyRejected.reason as UnauthorizedError);
    const [lightResult, ...resourceResults] = settled;
    const lightMetrics =
      lightResult.status === "fulfilled" ? lightResult.value : {};
    const [connectivity, power, devices, rooms] = resourceResults.map((r) =>
      r.status === "fulfilled" ? r.value : null
    );
    // every read failed: report it instead of a snapshot of blanks
    if (
      Object.keys(lightMetrics).length === 0 &&
      resourceResults.every((r) => r.status === "rejected")
    ) {
      const first = resourceResults.find(
        (r): r is PromiseRejectedResult => r.status === "rejected"
      );
      const reason =
        first?.reason instanceof Error ? first.reason.message : "no response";
      return err(
        new UnavailableError(
          this.pinned
            ? `hue bridge API unavailable: ${reason}`
            : `hue bridge API unavailable: ${NO_PIN_MESSAGE}`
        )
      );
    }

    const unreachable = connectivity
      ? connectivity.filter((c) => (c.status ?? "connected") !== "connected")
          .length
      : null;
    const batteryLevels = (power ?? [])
      .map((p) => p.power_state?.battery_level)
      .filter((lvl): lvl is number => typeof lvl === "number");
    const batteryLow = power
      ? (power ?? []).filter((p) => {
          const state = p.power_state?.battery_state;
          const level = p.power_state?.battery_level;
          return (
            (state !== undefined && state !== "normal") ||
            (typeof level === "number" && level < LOW_BATTERY_THRESHOLD)
          );
        }).length
      : null;

    const names = deviceNames(devices);
    const unreachableDevices = connectivity
      ? connectivity
          .filter((c) => (c.status ?? "connected") !== "connected")
          .slice(0, MAX_LISTED_DEVICES)
          .map((c) => ({
            name: names.get(c.owner?.rid ?? "") ?? "unknown device",
            status: c.status ?? "unknown",
          }))
      : null;
    const lowBatteryDevices = power
      ? power
          .filter((p) => {
            const state = p.power_state?.battery_state;
            const level = p.power_state?.battery_level;
            return (
              (state !== undefined && state !== "normal") ||
              (typeof level === "number" && level < LOW_BATTERY_THRESHOLD)
            );
          })
          .slice(0, MAX_LISTED_DEVICES)
          .map((p) => ({
            name: names.get(p.owner?.rid ?? "") ?? "unknown device",
            level: p.power_state?.battery_level ?? null,
          }))
      : null;

    return ok({
      at: this.now(),
      metrics: {
        ...base,
        ...lightMetrics,
        unreachableDevices,
        lowBatteryDevices,
        zigbeeUnreachableCount: unreachable,
        batteryLowCount: batteryLow,
        minBatteryPercent:
          batteryLevels.length > 0 ? Math.min(...batteryLevels) : null,
        deviceCount: devices?.length ?? null,
        roomCount: rooms?.length ?? null,
        sseConnected: this.sseHealthy,
        ...(this.lastEventAt > 0 ? { lastEventAt: this.lastEventAt } : {}),
      },
    });
  }

  private apiUrl(path: string): string {
    return `https://${this.host}${HUE_API_BASE}${path}`;
  }

  private apiHeaders(): Record<string, string> {
    return { "hue-application-key": this.applicationKey! };
  }

  private async probeApi(
    signal: AbortSignal
  ): Promise<{ reachable: boolean; keyRejected: boolean }> {
    try {
      // /resource/bridge is one small object; /resource/light would download
      // every light every health tick
      const res = await this.http.send({
        url: this.apiUrl("/resource/bridge"),
        method: "GET",
        headers: this.apiHeaders(),
        timeoutMs: this.timeoutMs,
        signal,
      });
      await res.text().catch(() => "");
      return {
        reachable: res.status >= 200 && res.status < 300,
        keyRejected: isKeyRejected(res.status),
      };
    } catch {
      return { reachable: false, keyRejected: false };
    }
  }

  private async fetchResource(
    path: string,
    signal: AbortSignal
  ): Promise<HueResource[]> {
    const res = await this.http.send({
      url: this.apiUrl(path),
      method: "GET",
      headers: this.apiHeaders(),
      timeoutMs: this.timeoutMs,
      signal,
    });
    if (res.status < 200 || res.status >= 300) {
      await res.text().catch(() => "");
      if (isKeyRejected(res.status)) {
        throw new UnauthorizedError(`hue ${KEY_REJECTED_MESSAGE}`);
      }
      throw new Error(`hue ${path} returned ${res.status}`);
    }
    const body = await res.json<HueListResponse<HueResource>>();
    return body.data ?? [];
  }

  /** Light on/off counts. While the eventstream is healthy and the state map
   *  is seeded, counts come from pushed state with no HTTP fetch. */
  private async lightCounts(
    signal: AbortSignal
  ): Promise<Record<string, unknown>> {
    if (this.sseHealthy && this.lightsSeeded) {
      const lightCount = this.liveLightOn.size;
      const onCount = [...this.liveLightOn.values()].filter(Boolean).length;
      return { lightCount, onCount, offCount: lightCount - onCount };
    }
    try {
      const res = await this.http.send({
        url: this.apiUrl("/resource/light"),
        method: "GET",
        headers: this.apiHeaders(),
        timeoutMs: this.timeoutMs,
        signal,
      });
      if (res.status < 200 || res.status >= 300) {
        await res.text().catch(() => "");
        if (isKeyRejected(res.status)) {
          throw new UnauthorizedError(`hue ${KEY_REJECTED_MESSAGE}`);
        }
        return {};
      }
      const body = await res.json<HueListResponse<HueLight>>();
      const lights = body.data ?? [];
      // seed the live map so SSE deltas keep it current from here on;
      // rebuild it so lights removed while unobserved don't linger
      this.liveLightOn.clear();
      for (const light of lights) {
        if (light.id && light.on !== undefined) {
          this.liveLightOn.set(light.id, light.on.on);
        }
      }
      this.lightsSeeded = true;
      const lightCount = lights.length;
      const onCount = lights.filter((l) => l.on?.on === true).length;
      return { lightCount, onCount, offCount: lightCount - onCount };
    } catch (e) {
      if (e instanceof UnauthorizedError) throw e;
      return {};
    }
  }
}

/** device id → display name (the name set in the Hue app, else the model). */
function deviceNames(
  devices: HueResource[] | null | undefined
): Map<string, string> {
  const names = new Map<string, string>();
  for (const d of devices ?? []) {
    const name =
      d.metadata?.name ?? d.product_data?.product_name ?? d.product_data?.model_id;
    if (d.id && name) names.set(d.id, name);
  }
  return names;
}
