import type { Logger } from 'pino';
import type { Clock } from '../../core/clock.js';
import type { EventBus } from '../../core/eventBus.js';
import type { StatsSnapshot } from '../../domain/BaseService.js';
import type { DuckDbPool } from './DuckDbPool.js';
import type { DuckDBConnection } from '@duckdb/node-api';
import { toTs } from './duckdbTime.js';

export interface TimeSeriesWriterOptions {
  pool: DuckDbPool;
  bus: EventBus;
  clock: Clock;
  logger: Logger;
  flushMs?: number;
  maxBatch?: number;
}

export interface TimeSeriesWriter {
  start(): Promise<void>;
  flush(): Promise<void>;
  stop(): Promise<void>;
}

interface Row {
  ts: Date;
  kind: string;
  instanceId: string;
  metric: string;
  valueNum: number | null;
  valueText: string | null;
  valueBool: boolean | null;
}

const DEFAULT_FLUSH_MS = 1000;
const DEFAULT_MAX_BATCH = 500;

export function createTimeSeriesWriter(opts: TimeSeriesWriterOptions): TimeSeriesWriter {
  const flushMs = opts.flushMs ?? DEFAULT_FLUSH_MS;
  const maxBatch = opts.maxBatch ?? DEFAULT_MAX_BATCH;
  let conn: DuckDBConnection | null = null;
  let buffer: Row[] = [];
  let unsub: (() => void) | null = null;
  let cancelTimer: (() => void) | null = null;
  let running = false;
  let flushing: Promise<void> | null = null;

  const flattenMetrics = (
    kind: string,
    instanceId: string,
    at: number,
    snap: StatsSnapshot,
  ): Row[] => {
    const ts = new Date(at);
    const rows: Row[] = [];
    for (const [metric, raw] of Object.entries(snap.metrics)) {
      if (raw === null || raw === undefined) continue;
      if (typeof raw === 'number') {
        if (!Number.isFinite(raw)) continue;
        rows.push({ ts, kind, instanceId, metric, valueNum: raw, valueText: null, valueBool: null });
      } else if (typeof raw === 'boolean') {
        rows.push({ ts, kind, instanceId, metric, valueNum: null, valueText: null, valueBool: raw });
      } else if (typeof raw === 'string') {
        rows.push({ ts, kind, instanceId, metric, valueNum: null, valueText: raw, valueBool: null });
      }
    }
    return rows;
  };

  const flushNow = async (): Promise<void> => {
    if (!conn || buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    const c = conn;
    try {
      const appender = await c.createAppender('metric_raw');
      for (const r of batch) {
        appender.appendTimestamp(toTs(r.ts));
        appender.appendVarchar(r.kind);
        appender.appendVarchar(r.instanceId);
        appender.appendVarchar(r.metric);
        if (r.valueNum === null) appender.appendNull(); else appender.appendDouble(r.valueNum);
        if (r.valueText === null) appender.appendNull(); else appender.appendVarchar(r.valueText);
        if (r.valueBool === null) appender.appendNull(); else appender.appendBoolean(r.valueBool);
        appender.endRow();
      }
      appender.closeSync();
    } catch (err) {
      opts.logger.error({ err, batchSize: batch.length }, 'timeseries writer flush failed');
    }
  };

  const scheduleFlush = (): void => {
    if (cancelTimer) return;
    cancelTimer = opts.clock.setTimeout(() => {
      cancelTimer = null;
      flushing = flushNow().finally(() => {
        flushing = null;
        if (running && buffer.length > 0) scheduleFlush();
      });
    }, flushMs);
  };

  return {
    async start(): Promise<void> {
      if (running) return;
      running = true;
      conn = await opts.pool.connect();
      unsub = opts.bus.on('service.stats.updated', (p) => {
        if (!p.snapshot) return;
        const rows = flattenMetrics(p.kind, p.instanceId, p.at, p.snapshot);
        if (rows.length === 0) return;
        buffer.push(...rows);
        if (buffer.length >= maxBatch) {
          if (cancelTimer) { cancelTimer(); cancelTimer = null; }
          flushing = flushNow();
        } else {
          scheduleFlush();
        }
      });
    },
    async flush(): Promise<void> {
      if (cancelTimer) { cancelTimer(); cancelTimer = null; }
      if (flushing) await flushing;
      await flushNow();
    },
    async stop(): Promise<void> {
      running = false;
      if (unsub) { unsub(); unsub = null; }
      if (cancelTimer) { cancelTimer(); cancelTimer = null; }
      if (flushing) await flushing;
      await flushNow();
    },
  };
}
