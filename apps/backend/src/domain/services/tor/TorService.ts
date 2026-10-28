import {
  BaseService,
  type HealthResult,
  type HostHealth,
  type PollPolicy,
  type StatsResult,
} from "../../BaseService.js";
import type { HttpClient, HttpResponse } from "../../../infra/http/client.js";
import { ok, err } from "../../../core/result.js";
import {
  UnavailableError,
  NotFoundError,
  isDomainError,
} from "../../../core/errors.js";
import type { TorInstance } from "../../../config/services.js";
import type { PingProber } from "../../../infra/net/pingProbe.js";
import type { TorControlClient } from "../../../infra/tor/controlClient.js";
import type {
  TorEventSubscription,
  TorEventSubscriptionFactory,
} from "../../../infra/tor/eventSubscription.js";

/**
 * After both ICMP and ControlPort fail (signals "off-LAN"), skip the ControlPort
 * probe for this long and serve Onionoo data instead, so we don't pay a TCP
 * timeout on every poll while away from the relay's network.
 */
const CONTROL_PORT_FALLBACK_COOLDOWN_MS = 5 * 60 * 1000;

/**
 * Tor emits a BW event every second. With no event for this long the
 * subscription is dead (never opened, or the socket dropped), so the rates
 * are reported as unknown and the subscription is reopened.
 */
const BW_STALE_MS = 30 * 1000;

/**
 * Onionoo refreshes relay details about once an hour, so a relay lookup is
 * reused for this long by both health and stats instead of hitting the
 * public service on every poll (10 s health + 30 s stats by default).
 */
const ONIONOO_RELAY_TTL_MS = 10 * 60 * 1000;

export interface TorDeps {
  http: HttpClient;
  ping: PingProber;
  torControl: TorControlClient;
  eventSubscriptionFactory?: TorEventSubscriptionFactory;
  config: TorInstance;
  now: () => number;
}

interface OnionooRelay {
  nickname: string;
  fingerprint: string;
  running: boolean;
  hibernating?: boolean;
  flags?: string[];
  country?: string;
  country_name?: string;
  city_name?: string;
  first_seen?: string;
  last_seen?: string;
  consensus_weight?: number;
  platform?: string;
  contact?: string;
  or_addresses?: string[];
  version?: string;
  observed_bandwidth?: number;
  bandwidth_burst?: number;
  as_name?: string;
  consensus_weight_fraction?: number;
}

interface OnionooResponse {
  relays?: OnionooRelay[];
}

export class TorService extends BaseService {
  readonly kind = "tor";
  readonly instanceId: string;
  readonly pollPolicy: PollPolicy;
  private readonly http: HttpClient;
  private readonly pinger: PingProber;
  private readonly torControl: TorControlClient;
  private readonly eventSubFactory: TorEventSubscriptionFactory | undefined;
  private readonly relayNickname: string;
  private readonly onionooBaseUrl: string;
  private readonly host: string;
  private readonly controlPort: number;
  private readonly controlPassword: string;
  private readonly cookieAuthFile: string;
  private readonly useControlPort: boolean;
  private readonly timeoutMs: number;
  private readonly pingCount: number;
  private readonly now: () => number;
  private subscription: TorEventSubscription | undefined;
  private subAbort: AbortController | undefined;
  private bwRead = 0;
  private bwWritten = 0;
  /** Time of the last BW event; null = none since the last subscribe */
  private lastBwAt: number | null = null;
  /** Time the current subscription was opened; null = no subscription */
  private subscribedAt: number | null = null;
  private resubscribing = false;
  private stopped = false;
  /** Cumulative traffic/read from last poll; -1 = no baseline yet */
  private lastTrafficRead = -1;
  /** Cumulative traffic/written from last poll; -1 = no baseline yet */
  private lastTrafficWritten = -1;
  /** Until this timestamp, skip ControlPort and serve Onionoo (off-LAN cooldown). */
  private controlPortUnreachableUntil = 0;
  /** Last successful Onionoo relay lookup (see ONIONOO_RELAY_TTL_MS). */
  private relayCache:
    | { at: number; latencyMs: number; relay: OnionooRelay | null }
    | undefined;

  constructor(deps: TorDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.http = deps.http;
    this.pinger = deps.ping;
    this.torControl = deps.torControl;
    this.eventSubFactory = deps.eventSubscriptionFactory;
    this.relayNickname = deps.config.relayNickname;
    this.onionooBaseUrl = deps.config.onionooBaseUrl.replace(/\/+$/, "");
    this.host = deps.config.host;
    this.controlPort = deps.config.controlPort;
    this.controlPassword = deps.config.controlPassword;
    this.cookieAuthFile = deps.config.cookieAuthFile;
    this.useControlPort = deps.config.useControlPort;
    this.timeoutMs = deps.config.timeoutMs;
    this.pingCount = deps.config.pingCount;
    this.now = deps.now;
  }

  async onStart(): Promise<void> {
    this.stopped = false;
    await this.subscribe();
  }

  private async subscribe(): Promise<void> {
    if (!this.useControlPort || !this.eventSubFactory) return;
    this.subAbort = new AbortController();
    this.lastBwAt = null;
    const sub = await this.eventSubFactory.create(
      {
        host: this.host,
        port: this.controlPort,
        password: this.controlPassword,
        cookieAuthFile: this.cookieAuthFile,
        timeoutMs: this.timeoutMs,
      },
      this.subAbort.signal
    );
    sub.on("BW", (_event, args) => {
      this.bwRead = parseInt(args[0] ?? "0", 10);
      this.bwWritten = parseInt(args[1] ?? "0", 10);
      this.lastBwAt = this.now();
    });
    try {
      await sub.setevents(["BW"], this.subAbort.signal);
    } catch (e) {
      // the socket is open and authenticated; don't leak it
      await sub.close().catch(() => undefined);
      throw e;
    }
    if (this.stopped) {
      await sub.close().catch(() => undefined);
      return;
    }
    this.subscription = sub;
    this.subscribedAt = this.now();
  }

  /** True when a BW event arrived recently enough to trust bwRead/bwWritten. */
  private bwFresh(): boolean {
    return this.lastBwAt !== null && this.now() - this.lastBwAt <= BW_STALE_MS;
  }

  /** Reopen the BW subscription when it failed at start or has gone quiet.
   *  Best-effort and in the background, so a stats poll never waits on it. */
  private maybeResubscribe(): void {
    if (!this.useControlPort || !this.eventSubFactory) return;
    if (this.resubscribing || this.stopped || this.bwFresh()) return;
    // a fresh subscription gets BW_STALE_MS to deliver its first event
    if (
      this.subscription &&
      this.subscribedAt !== null &&
      this.now() - this.subscribedAt <= BW_STALE_MS
    ) {
      return;
    }
    this.resubscribing = true;
    void (async () => {
      try {
        this.subAbort?.abort();
        await this.subscription?.close().catch(() => undefined);
        this.subscription = undefined;
        this.subscribedAt = null;
        await this.subscribe();
      } catch {
        // tor still unreachable; retried on the next stats poll
      } finally {
        this.resubscribing = false;
      }
    })();
  }

  async onStop(): Promise<void> {
    this.stopped = true;
    this.subAbort?.abort();
    await this.subscription?.close().catch(() => undefined);
    this.subscription = undefined;
    this.subAbort = undefined;
    this.subscribedAt = null;
  }

  async checkHealth(signal: AbortSignal): Promise<HealthResult> {
    if (!this.useControlPort) return this.checkHealthOnionoo(signal);
    if (this.isControlPortInCooldown()) return this.fallbackCheckHealth(signal);
    return this.checkHealthControlPort(signal);
  }

  async getStats(signal: AbortSignal): Promise<StatsResult> {
    if (!this.useControlPort) return this.getStatsOnionoo(signal);
    if (this.isControlPortInCooldown()) return this.fallbackGetStats(signal);
    return this.getStatsControlPort(signal);
  }

  // ─── Fallback orchestration ────────────────────────────────────────────────

  private isControlPortInCooldown(): boolean {
    return this.now() < this.controlPortUnreachableUntil;
  }

  private markControlPortUnreachable(): void {
    this.controlPortUnreachableUntil =
      this.now() + CONTROL_PORT_FALLBACK_COOLDOWN_MS;
  }

  private clearControlPortCooldown(): void {
    this.controlPortUnreachableUntil = 0;
  }

  private async fallbackCheckHealth(
    signal: AbortSignal
  ): Promise<HealthResult> {
    const result = await this.checkHealthOnionoo(signal);
    if (!result.ok) return result;
    return ok({
      ...result.value,
      details: {
        ...(result.value.details ?? {}),
        source: "onionoo",
        controlPortReachable: false,
      },
    });
  }

  private async fallbackGetStats(signal: AbortSignal): Promise<StatsResult> {
    const result = await this.getStatsOnionoo(signal);
    if (!result.ok) return result;
    return ok({
      ...result.value,
      metrics: { ...result.value.metrics, source: "onionoo" },
    });
  }

  // ─── ControlPort path ──────────────────────────────────────────────────────

  private async checkHealthControlPort(
    signal: AbortSignal
  ): Promise<HealthResult> {
    const started = this.now();
    const [pingSettled, controlSettled] = await Promise.allSettled([
      this.pinger.probe({
        host: this.host,
        timeoutMs: this.timeoutMs,
        count: this.pingCount,
        signal,
      }),
      this.probeCircuit(signal),
    ]);

    const icmpAlive =
      pingSettled.status === "fulfilled" && pingSettled.value.success;
    const pingMs =
      pingSettled.status === "fulfilled" ? pingSettled.value.avgMs : undefined;
    const controlPortReachable = controlSettled.status === "fulfilled";

    // Off-LAN heuristic: if both ICMP and ControlPort fail, we likely can't
    // reach the relay's network at all. Mark cooldown and serve Onionoo so
    // we don't retry the doomed ControlPort connection on every poll.
    if (!icmpAlive && !controlPortReachable) {
      this.markControlPortUnreachable();
      return this.fallbackCheckHealth(signal);
    }
    this.clearControlPortCooldown();

    const host: HostHealth = {
      reachable: icmpAlive,
      ...(pingMs !== undefined ? { pingMs } : {}),
    };
    const circuitEstablished =
      controlSettled.status === "fulfilled" && controlSettled.value;
    const service = {
      reachable: circuitEstablished,
      details: { controlPort: this.controlPort },
    };
    const reachable = host.reachable || service.reachable;
    const latencyMs = pingMs ?? this.now() - started;

    return ok({
      reachable,
      latencyMs,
      at: this.now(),
      host,
      service,
      details: {
        host: this.host,
        icmpAlive,
        circuitEstablished,
        controlPort: this.controlPort,
        source: "control-port",
        controlPortReachable,
      },
    });
  }

  private async probeCircuit(signal: AbortSignal): Promise<boolean> {
    const handle = await this.torControl.connect(
      {
        host: this.host,
        port: this.controlPort,
        password: this.controlPassword,
        cookieAuthFile: this.cookieAuthFile,
        timeoutMs: this.timeoutMs,
      },
      signal
    );
    try {
      const info = await handle.getinfo(["status/circuit-established"], signal);
      return info.get("status/circuit-established") === "1";
    } finally {
      await handle.close().catch(() => undefined);
    }
  }

  private async getStatsControlPort(signal: AbortSignal): Promise<StatsResult> {
    try {
      const handle = await this.torControl.connect(
        {
          host: this.host,
          port: this.controlPort,
          password: this.controlPassword,
          cookieAuthFile: this.cookieAuthFile,
          timeoutMs: this.timeoutMs,
        },
        signal
      );
      try {
        const coreInfo = await handle.getinfo(
          [
            "traffic/read",
            "traffic/written",
            "version/current",
            "dormant",
            "process/descriptor-limit",
          ],
          signal
        );
        const acctInfo = await handle
          .getinfo(["accounting/bytes", "accounting/bytes-left"], signal)
          .catch(() => new Map<string, string>());

        // connection/circuit listings are standard; relay identity keys
        // (fingerprint/address) fail on client-only nodes — each group is
        // fetched separately so one missing key can't blank the others
        const connInfo = await handle
          .getinfo(["orconn-status", "circuit-status"], signal)
          .catch(() => new Map<string, string>());
        const identityInfo = await handle
          .getinfo(["fingerprint", "address"], signal)
          .catch(() => new Map<string, string>());

        // own consensus entry (flags + bandwidth weight) and GeoIP country
        // come from the local node — no external Onionoo round-trip needed
        const fingerprint = identityInfo.get("fingerprint") ?? "";
        const address = identityInfo.get("address") ?? "";
        const nsInfo = fingerprint
          ? await handle
              .getinfo([`ns/id/${fingerprint}`], signal)
              .catch(() => new Map<string, string>())
          : new Map<string, string>();
        const countryInfo = address
          ? await handle
              .getinfo([`ip-to-country/${address}`], signal)
              .catch(() => new Map<string, string>())
          : new Map<string, string>();

        const trafficRead = parseIntMetric(coreInfo.get("traffic/read"));
        const trafficWritten = parseIntMetric(coreInfo.get("traffic/written"));
        const trafficDeltaRead = counterDelta(
          trafficRead,
          this.lastTrafficRead
        );
        const trafficDeltaWritten = counterDelta(
          trafficWritten,
          this.lastTrafficWritten
        );
        this.lastTrafficRead = trafficRead;
        this.lastTrafficWritten = trafficWritten;

        const orconnLines = statusLines(connInfo.get("orconn-status"));
        const circuitLines = statusLines(connInfo.get("circuit-status"));
        const connectionsTotal = orconnLines.length;
        const connectionsCurrent = orconnLines.filter((l) =>
          l.includes("CONNECTED")
        ).length;
        const circuitsTotal = circuitLines.length;
        const circuitsActive = circuitLines.filter((l) =>
          / BUILT /.test(` ${l} `)
        ).length;

        const nsEntry = parseNsEntry(nsInfo.get(`ns/id/${fingerprint}`));
        const localCountry = countryInfo.get(`ip-to-country/${address}`) ?? "";

        const enriched = await this.enrich(signal);
        const bwFresh = this.bwFresh();
        this.maybeResubscribe();
        const country = localCountry !== "" ? localCountry : enriched.country;
        const consensusWeight = nsEntry.bandwidth ?? enriched.consensusWeight;

        return ok({
          at: this.now(),
          metrics: {
            source: "control-port",
            host: this.host,
            controlPort: this.controlPort,
            trafficRead,
            trafficWritten,
            trafficDeltaRead,
            trafficDeltaWritten,
            // null = no live BW subscription, not "0 bytes/s"
            bwRead: bwFresh ? this.bwRead : null,
            bwWritten: bwFresh ? this.bwWritten : null,
            // the tile hero and charts read the Onionoo key; a relay forwards
            // roughly what it receives, so the busier direction stands in for
            // Onionoo's one-direction observed bandwidth
            bandwidthCurrent: bwFresh
              ? Math.max(this.bwRead, this.bwWritten)
              : null,
            version: coreInfo.get("version/current") ?? "",
            dormant: coreInfo.get("dormant") === "1",
            descriptorLimit: parseIntMetric(
              coreInfo.get("process/descriptor-limit")
            ),
            accountingBytes: acctInfo.get("accounting/bytes") ?? "",
            accountingBytesLeft: acctInfo.get("accounting/bytes-left") ?? "",
            connections: {
              current: connectionsCurrent,
              total: connectionsTotal,
            },
            circuits: { active: circuitsActive, total: circuitsTotal },
            ...(fingerprint ? { fingerprint } : {}),
            ...(nsEntry.flags.length > 0
              ? {
                  flags: nsEntry.flags.join(","),
                  relayType: determineRelayType(nsEntry.flags),
                }
              : {}),
            ...(country !== undefined ? { country } : {}),
            ...(consensusWeight !== undefined ? { consensusWeight } : {}),
            ...(enriched.asName !== undefined
              ? { asName: enriched.asName }
              : {}),
            ...(enriched.consensusWeightFraction !== undefined
              ? { consensusWeightFraction: enriched.consensusWeightFraction }
              : {}),
          },
        });
      } finally {
        await handle.close().catch(() => undefined);
      }
    } catch (e) {
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`tor control stats failed: ${msg}`));
    }
  }

  // ─── Onionoo path ──────────────────────────────────────────────────────────

  private async checkHealthOnionoo(signal: AbortSignal): Promise<HealthResult> {
    try {
      const { relay, latencyMs } = await this.cachedRelay(signal);
      if (!relay) {
        return err(
          new NotFoundError(`tor relay "${this.relayNickname}" not found`)
        );
      }
      const version = relay.version ?? relay.platform ?? "unknown";
      const details: Record<string, unknown> = {
        version,
        running: relay.running,
      };
      if (!relay.running) details["warning"] = "relay is not running";
      else if (relay.hibernating) details["warning"] = "relay is hibernating";
      return ok({
        reachable: Boolean(relay.running) && !relay.hibernating,
        latencyMs,
        at: this.now(),
        details,
      });
    } catch (e) {
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`tor unreachable: ${msg}`));
    }
  }

  private async getStatsOnionoo(signal: AbortSignal): Promise<StatsResult> {
    try {
      const { relay } = await this.cachedRelay(signal);
      if (!relay) {
        return err(
          new NotFoundError(`tor relay "${this.relayNickname}" not found`)
        );
      }
      return ok({
        at: this.now(),
        metrics: {
          nickname: relay.nickname,
          fingerprint: relay.fingerprint.slice(0, 8) + "...",
          running: Boolean(relay.running),
          hibernating: Boolean(relay.hibernating),
          flags: (relay.flags ?? []).join(","),
          country: relay.country_name ?? relay.country ?? "Unknown",
          city: relay.city_name ?? "Unknown",
          firstSeen: relay.first_seen ?? "",
          lastSeen: relay.last_seen ?? "",
          consensusWeight: relay.consensus_weight ?? 0,
          platform: relay.platform ?? "Unknown",
          contact: relay.contact ?? "",
          orPort: extractORPort(relay.or_addresses),
          relayType: determineRelayType(relay.flags ?? []),
          version: relay.version ?? relay.platform ?? "Unknown",
          bandwidthCurrent: relay.observed_bandwidth ?? 0,
          bandwidthBurst: relay.bandwidth_burst ?? 0,
        },
      });
    } catch (e) {
      if (isDomainError(e)) return err(e);
      const msg = e instanceof Error ? e.message : String(e);
      return err(new UnavailableError(`tor stats failed: ${msg}`));
    }
  }

  /** searchRelay, reused for ONIONOO_RELAY_TTL_MS. Failures are not cached. */
  private async cachedRelay(
    signal: AbortSignal
  ): Promise<{ relay: OnionooRelay | null; latencyMs: number }> {
    if (
      this.relayCache &&
      this.now() - this.relayCache.at < ONIONOO_RELAY_TTL_MS
    ) {
      return this.relayCache;
    }
    const started = this.now();
    const relay = await this.searchRelay(signal);
    const at = this.now();
    this.relayCache = { at, latencyMs: at - started, relay };
    return this.relayCache;
  }

  private async searchRelay(signal: AbortSignal): Promise<OnionooRelay | null> {
    // an empty search would return every relay, so never query without one
    if (this.relayNickname.trim() === "") return null;
    const url = `${this.onionooBaseUrl}/details?search=${encodeURIComponent(this.relayNickname)}`;
    const res = await this.http.send({
      url,
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": "Watchman-Dashboard/1.0",
      },
      signal,
      timeoutMs: this.timeoutMs,
    });
    const data = await this.parseOnionoo(res);
    const relays = data.relays ?? [];
    // Onionoo search also matches partial nicknames and fingerprint prefixes, so only
    // accept an exact nickname or fingerprint — anything else is a different
    // relay
    const term = this.relayNickname.trim();
    const nick = term.toLowerCase();
    const fp = term.replace(/^\$/, "").toUpperCase();
    return (
      relays.find((r) => r.nickname?.toLowerCase() === nick) ??
      relays.find((r) => r.fingerprint?.toUpperCase() === fp) ??
      null
    );
  }

  private async parseOnionoo(res: HttpResponse): Promise<OnionooResponse> {
    if (res.status < 200 || res.status >= 300) {
      const text = await res.text().catch(() => "");
      throw new UnavailableError(
        `onionoo returned ${res.status}: ${text.slice(0, 200)}`
      );
    }
    return res.json<OnionooResponse>();
  }

  // Onionoo enrichment (country/AS/consensus weight) changes on the order of
  // hours; cache it so ControlPort stats polls don't hit the external service
  // every cycle. Failures fall back to the last known value.
  private static readonly ENRICH_TTL_MS = 60 * 60 * 1000;
  private enrichCache: { at: number; value: TorEnrichment } | null = null;

  private async enrich(signal: AbortSignal): Promise<TorEnrichment> {
    if (
      this.enrichCache &&
      this.now() - this.enrichCache.at < TorService.ENRICH_TTL_MS
    ) {
      return this.enrichCache.value;
    }
    try {
      const relay = await this.searchRelay(signal);
      if (!relay) return this.enrichCache?.value ?? {};
      const value: TorEnrichment = {
        ...((relay.country_name ?? relay.country)
          ? { country: relay.country_name ?? relay.country }
          : {}),
        ...(relay.consensus_weight !== undefined
          ? { consensusWeight: relay.consensus_weight }
          : {}),
        ...(relay.as_name !== undefined ? { asName: relay.as_name } : {}),
        ...(relay.consensus_weight_fraction !== undefined
          ? { consensusWeightFraction: relay.consensus_weight_fraction }
          : {}),
      };
      this.enrichCache = { at: this.now(), value };
      return value;
    } catch {
      return this.enrichCache?.value ?? {};
    }
  }
}

interface TorEnrichment {
  country?: string;
  consensusWeight?: number;
  asName?: string;
  consensusWeightFraction?: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function extractORPort(addresses: string[] | undefined): number {
  if (!addresses) return 9001;
  for (const addr of addresses) {
    const m = addr.match(/:(\d+)$/);
    if (m && m[1]) return parseInt(m[1], 10);
  }
  return 9001;
}

function determineRelayType(flags: string[]): string {
  if (flags.includes("Exit")) return "exit";
  if (flags.includes("Guard")) return "guard";
  if (flags.includes("Bridge")) return "bridge";
  return "relay";
}

/** Bytes since the last poll. 0 without a baseline; null when the counter
 *  went backwards (Tor restarted and reset it), so no bogus negative delta. */
function counterDelta(current: number, last: number): number | null {
  if (last < 0) return 0;
  if (current < last) return null;
  return current - last;
}

function parseIntMetric(value: string | undefined): number {
  if (value === undefined) return 0;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Split a multiline GETINFO listing (orconn-status / circuit-status) into
 *  trimmed non-empty entry lines. */
function statusLines(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

/** Parse the node's own router-status entry (GETINFO ns/id/<fp>):
 *  the `s` line carries consensus flags, `w Bandwidth=` the weight. */
function parseNsEntry(raw: string | undefined): {
  flags: string[];
  bandwidth: number | null;
} {
  const flags: string[] = [];
  let bandwidth: number | null = null;
  for (const line of statusLines(raw)) {
    if (line.startsWith("s ")) {
      flags.push(...line.slice(2).split(/\s+/).filter(Boolean));
    } else if (line.startsWith("w ")) {
      const m = line.match(/Bandwidth=(\d+)/);
      if (m?.[1]) bandwidth = parseInt(m[1], 10);
    }
  }
  return { flags, bandwidth };
}
