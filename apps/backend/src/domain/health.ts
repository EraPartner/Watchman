import type { PingProber } from '../infra/net/pingProbe.js';
import type { HostHealth, ServiceHealth, HealthResult } from './BaseService.js';
import { ok } from '../core/result.js';

export interface PingOpts {
  host: string;
  timeoutMs: number;
  pingCount: number;
  prober: PingProber;
}

/**
 * Run host ping and service probe in parallel.
 * Always resolves ok() — network failures captured as reachable:false in tier sub-objects.
 * Top-level reachable = host.reachable AND service.reachable.
 */
export async function withHostPing(
  pingOpts: PingOpts,
  probe: (signal: AbortSignal) => Promise<ServiceHealth>,
  at: number,
  signal: AbortSignal,
): Promise<HealthResult> {
  const [pingSettled, serviceSettled] = await Promise.allSettled([
    pingOpts.prober.probe({
      host: pingOpts.host,
      timeoutMs: pingOpts.timeoutMs,
      count: pingOpts.pingCount,
      signal,
    }),
    probe(signal),
  ]);

  const host: HostHealth =
    pingSettled.status === 'fulfilled'
      ? {
          reachable: pingSettled.value.success,
          ...(pingSettled.value.avgMs !== undefined ? { pingMs: pingSettled.value.avgMs } : {}),
        }
      : { reachable: false };

  const service: ServiceHealth =
    serviceSettled.status === 'fulfilled'
      ? serviceSettled.value
      : {
          reachable: false,
          message:
            serviceSettled.reason instanceof Error
              ? serviceSettled.reason.message
              : String(serviceSettled.reason),
        };

  const reachable = host.reachable && service.reachable;
  const latencyMs = service.latencyMs ?? host.pingMs;

  return ok({
    host,
    service,
    reachable,
    ...(latencyMs !== undefined ? { latencyMs } : {}),
    ...(service.message !== undefined ? { message: service.message } : {}),
    ...(service.details !== undefined ? { details: service.details } : {}),
    at,
  });
}
