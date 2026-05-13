import { BaseService, type HealthResult, type HostHealth, type PollPolicy, type StatsResult } from '../../BaseService.js';
import type { HttpClient, HttpResponse } from '../../../infra/http/client.js';
import { ok, err } from '../../../core/result.js';
import { UnavailableError, NotFoundError, isDomainError } from '../../../core/errors.js';
import type { TorInstance } from '../../../config/services.js';
import type { PingProber } from '../../../infra/net/pingProbe.js';
import type { TorControlClient } from '../../../infra/tor/controlClient.js';
import type {
  TorEventSubscription,
  TorEventSubscriptionFactory,
} from '../../../infra/tor/eventSubscription.js';

/**
 * After both ICMP and ControlPort fail (signals "off-LAN"), skip the ControlPort
 * probe for this long and serve Onionoo data instead, so we don't pay a TCP
 * timeout on every poll while away from the relay's network.
 */
const CONTROL_PORT_FALLBACK_COOLDOWN_MS = 5 * 60 * 1000;

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
  readonly kind = 'tor';
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
  /** Cumulative traffic/read from last poll; -1 = no baseline yet */
  private lastTrafficRead = -1;
  /** Cumulative traffic/written from last poll; -1 = no baseline yet */
  private lastTrafficWritten = -1;
  /** Until this timestamp, skip ControlPort and serve Onionoo (off-LAN cooldown). */
  private controlPortUnreachableUntil = 0;

  constructor(deps: TorDeps) {
    super();
    this.instanceId = deps.config.instanceId;
    this.pollPolicy = deps.config.pollPolicy;
    this.http = deps.http;
    this.pinger = deps.ping;
    this.torControl = deps.torControl;
    this.eventSubFactory = deps.eventSubscriptionFactory;
    this.relayNickname = deps.config.relayNickname;
    this.onionooBaseUrl = deps.config.onionooBaseUrl.replace(/\/+$/, '');
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
    if (!this.useControlPort || !this.eventSubFactory) return;
    this.subAbort = new AbortController();
    const sub = await this.eventSubFactory.create(
      {
        host: this.host,
        port: this.controlPort,
        password: this.controlPassword,
        cookieAuthFile: this.cookieAuthFile,
        timeoutMs: this.timeoutMs,
      },
      this.subAbort.signal,
    );
    sub.on('BW', (_event, args) => {
      this.bwRead = parseInt(args[0] ?? '0', 10);
      this.bwWritten = parseInt(args[1] ?? '0', 10);
    });
    await sub.setevents(['BW'], this.subAbort.signal);
    this.subscription = sub;
  }

  async onStop(): Promise<void> {
    this.subAbort?.abort();
    await this.subscription?.close().catch(() => undefined);
    this.subscription = undefined;
    this.subAbort = undefined;
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
    this.controlPortUnreachableUntil = this.now() + CONTROL_PORT_FALLBACK_COOLDOWN_MS;
  }

  private clearControlPortCooldown(): void {
    this.controlPortUnreachableUntil = 0;
  }

  private async fallbackCheckHealth(signal: AbortSignal): Promise<HealthResult> {
    const result = await this.checkHealthOnionoo(signal);
    if (!result.ok) return result;
    return ok({
      ...result.value,
      details: {
        ...(result.value.details ?? {}),
        source: 'onionoo',
        controlPortReachable: false,
      },
    });
  }

  private async fallbackGetStats(signal: AbortSignal): Promise<StatsResult> {
    const result = await this.getStatsOnionoo(signal);
    if (!result.ok) return result;
    return ok({
      ...result.value,
      metrics: { ...result.value.metrics, source: 'onionoo' },
    });
  }

  // ─── ControlPort path ──────────────────────────────────────────────────────

  private async checkHealthControlPort(signal: AbortSignal): Promise<HealthResult> {
    const started = this.now();
    const [pingSettled, controlSettled] = await Promise.allSettled([
      this.pinger.probe({ host: this.host, timeoutMs: this.timeoutMs, count: this.pingCount, signal }),
      this.probeCircuit(signal),
    ]);

    const icmpAlive = pingSettled.status === 'fulfilled' && pingSettled.value.success;
    const pingMs = pingSettled.status === 'fulfilled' ? pingSettled.value.avgMs : undefined;
    const controlPortReachable = controlSettled.status === 'fulfilled';

    // Off-LAN heuristic: if both ICMP and ControlPort fail, we likely can't
    // reach the relay's network at all. Mark cooldown and serve Onionoo so
    // we don't retry the doomed ControlPort connection on every poll.
    if (!icmpAlive && !controlPortReachable) {
      this.markControlPortUnreachable();
      return this.fallbackCheckHealth(signal);
    }
    this.clearControlPortCooldown();

    const host: HostHealth = { reachable: icmpAlive, ...(pingMs !== undefined ? { pingMs } : {}) };
    const circuitEstablished = controlSettled.status === 'fulfilled' && controlSettled.value;
    const service = { reachable: circuitEstablished, details: { controlPort: this.controlPort } };
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
        source: 'control-port',
        controlPortReachable,
      },
    });
  }

  private async probeCircuit(signal: AbortSignal): Promise<boolean> {
    const handle = await this.torControl.connect(
      { host: this.host, port: this.controlPort, password: this.controlPassword, cookieAuthFile: this.cookieAuthFile, timeoutMs: this.timeoutMs },
      signal,
    );
    try {
      const info = await handle.getinfo(['status/circuit-established'], signal);
      return info.get('status/circuit-established') === '1';
    } finally {
      await handle.close().catch(() => undefined);
    }
  }

  private async getStatsControlPort(signal: AbortSignal): Promise<StatsResult> {
    try {
      const handle = await this.torControl.connect(
        { host: this.host, port: this.controlPort, password: this.controlPassword, cookieAuthFile: this.cookieAuthFile, timeoutMs: this.timeoutMs },
        signal,
      );
      try {
        const coreInfo = await handle.getinfo(
          ['traffic/read', 'traffic/written', 'version/current', 'dormant', 'process/descriptor-limit'],
          signal,
        );
        const acctInfo = await handle.getinfo(
          ['accounting/bytes', 'accounting/bytes-left'],
          signal,
        ).catch(() => new Map<string, string>());

        const trafficRead = parseIntMetric(coreInfo.get('traffic/read'));
        const trafficWritten = parseIntMetric(coreInfo.get('traffic/written'));
        const trafficDeltaRead = this.lastTrafficRead >= 0 ? trafficRead - this.lastTrafficRead : 0;
        const trafficDeltaWritten = this.lastTrafficWritten >= 0 ? trafficWritten - this.lastTrafficWritten : 0;
        this.lastTrafficRead = trafficRead;
        this.lastTrafficWritten = trafficWritten;

        const enriched = await this.enrich(signal);

        return ok({
          at: this.now(),
          metrics: {
            source: 'control-port',
            host: this.host,
            controlPort: this.controlPort,
            trafficRead,
            trafficWritten,
            trafficDeltaRead,
            trafficDeltaWritten,
            bwRead: this.bwRead,
            bwWritten: this.bwWritten,
            version: coreInfo.get('version/current') ?? '',
            dormant: coreInfo.get('dormant') === '1',
            descriptorLimit: parseIntMetric(coreInfo.get('process/descriptor-limit')),
            accountingBytes: acctInfo.get('accounting/bytes') ?? '',
            accountingBytesLeft: acctInfo.get('accounting/bytes-left') ?? '',
            ...(enriched.country !== undefined ? { country: enriched.country } : {}),
            ...(enriched.consensusWeight !== undefined ? { consensusWeight: enriched.consensusWeight } : {}),
            ...(enriched.asName !== undefined ? { asName: enriched.asName } : {}),
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
    const started = this.now();
    try {
      const relay = await this.searchRelay(signal);
      const latencyMs = this.now() - started;
      if (!relay) {
        return err(new NotFoundError(`tor relay "${this.relayNickname}" not found`));
      }
      const version = relay.version ?? relay.platform ?? 'unknown';
      const details: Record<string, unknown> = { version, running: relay.running };
      if (!relay.running) details['warning'] = 'relay is not running';
      else if (relay.hibernating) details['warning'] = 'relay is hibernating';
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
      const relay = await this.searchRelay(signal);
      if (!relay) {
        return err(new NotFoundError(`tor relay "${this.relayNickname}" not found`));
      }
      return ok({
        at: this.now(),
        metrics: {
          nickname: relay.nickname,
          fingerprint: relay.fingerprint.slice(0, 8) + '...',
          running: Boolean(relay.running),
          hibernating: Boolean(relay.hibernating),
          flags: (relay.flags ?? []).join(','),
          country: relay.country_name ?? relay.country ?? 'Unknown',
          city: relay.city_name ?? 'Unknown',
          firstSeen: relay.first_seen ?? '',
          lastSeen: relay.last_seen ?? '',
          consensusWeight: relay.consensus_weight ?? 0,
          platform: relay.platform ?? 'Unknown',
          contact: relay.contact ?? '',
          orPort: extractORPort(relay.or_addresses),
          relayType: determineRelayType(relay.flags ?? []),
          version: relay.version ?? relay.platform ?? 'Unknown',
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

  private async searchRelay(signal: AbortSignal): Promise<OnionooRelay | null> {
    const url = `${this.onionooBaseUrl}/details?search=${encodeURIComponent(this.relayNickname)}`;
    const res = await this.http.send({
      url,
      method: 'GET',
      headers: {
        accept: 'application/json',
        'user-agent': 'Watchman-Dashboard/1.0',
      },
      signal,
      timeoutMs: this.timeoutMs,
    });
    const data = await this.parseOnionoo(res);
    const relays = data.relays ?? [];
    if (relays.length === 0) return null;
    const nick = this.relayNickname.toLowerCase();
    return relays.find((r) => r.nickname.toLowerCase() === nick) ?? relays[0] ?? null;
  }

  private async parseOnionoo(res: HttpResponse): Promise<OnionooResponse> {
    if (res.status < 200 || res.status >= 300) {
      const text = await res.text().catch(() => '');
      throw new UnavailableError(`onionoo returned ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json<OnionooResponse>();
  }

  private async enrich(signal: AbortSignal): Promise<{
    country?: string;
    consensusWeight?: number;
    asName?: string;
    consensusWeightFraction?: number;
  }> {
    try {
      const relay = await this.searchRelay(signal);
      if (!relay) return {};
      return {
        ...(relay.country_name ?? relay.country ? { country: relay.country_name ?? relay.country } : {}),
        ...(relay.consensus_weight !== undefined ? { consensusWeight: relay.consensus_weight } : {}),
        ...(relay.as_name !== undefined ? { asName: relay.as_name } : {}),
        ...(relay.consensus_weight_fraction !== undefined
          ? { consensusWeightFraction: relay.consensus_weight_fraction }
          : {}),
      };
    } catch {
      return {};
    }
  }
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
  if (flags.includes('Exit')) return 'exit';
  if (flags.includes('Guard')) return 'guard';
  if (flags.includes('Bridge')) return 'bridge';
  return 'relay';
}

function parseIntMetric(value: string | undefined): number {
  if (value === undefined) return 0;
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : 0;
}
