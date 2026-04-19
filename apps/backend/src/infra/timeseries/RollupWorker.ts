import type { Logger } from 'pino';
import type { Clock } from '../../core/clock.js';
import type { DuckDbPool } from './DuckDbPool.js';
import type { DuckDBConnection } from '@duckdb/node-api';
import { toTs } from './duckdbTime.js';

export interface RollupWorkerOptions {
  pool: DuckDbPool;
  clock: Clock;
  logger: Logger;
  tickMsOverrides?: Partial<Record<TierName, number>>;
}

export interface RollupWorker {
  start(): Promise<void>;
  stop(): Promise<void>;
  runOnce(tier: TierName): Promise<void>;
}

export type TierName = '1m' | '5m' | '1h';

interface TierConfig {
  name: TierName;
  source: string;
  target: string;
  bucketSeconds: number;
  tickMs: number;
  pruneSourceMs: number;
  pruneTargetMs: number;
  sourceIsRaw: boolean;
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const TIERS: TierConfig[] = [
  {
    name: '1m',
    source: 'metric_raw',
    target: 'metric_1m',
    bucketSeconds: 60,
    tickMs: 30_000,
    pruneSourceMs: 6 * HOUR,
    pruneTargetMs: 48 * HOUR,
    sourceIsRaw: true,
  },
  {
    name: '5m',
    source: 'metric_1m',
    target: 'metric_5m',
    bucketSeconds: 300,
    tickMs: 2 * 60_000,
    pruneSourceMs: 48 * HOUR,
    pruneTargetMs: 14 * DAY,
    sourceIsRaw: false,
  },
  {
    name: '1h',
    source: 'metric_5m',
    target: 'metric_1h',
    bucketSeconds: 3600,
    tickMs: 10 * 60_000,
    pruneSourceMs: 14 * DAY,
    pruneTargetMs: 30 * DAY,
    sourceIsRaw: false,
  },
];

export function createRollupWorker(opts: RollupWorkerOptions): RollupWorker {
  let conn: DuckDBConnection | null = null;
  const cancelers: Array<() => void> = [];
  let running = false;

  const rollupFromRaw = async (c: DuckDBConnection, tier: TierConfig, lastBucket: Date): Promise<void> => {
    const bucketSql = `time_bucket(INTERVAL '${tier.bucketSeconds} seconds', ts)`;
    await c.run(
      `INSERT INTO ${tier.target}
         SELECT ${bucketSql} AS ts, kind, instance_id, metric,
                min(value_num) AS min_v,
                max(value_num) AS max_v,
                avg(value_num) AS avg_v,
                arg_max(value_num, ts) AS last_v,
                count(value_num) AS sample_count
         FROM ${tier.source}
         WHERE value_num IS NOT NULL AND ts > ?
         GROUP BY ${bucketSql}, kind, instance_id, metric
         HAVING ${bucketSql} < date_trunc('second', now())`,
      [toTs(lastBucket)],
    );
  };

  const rollupFromAgg = async (c: DuckDBConnection, tier: TierConfig, lastBucket: Date): Promise<void> => {
    const bucketSql = `time_bucket(INTERVAL '${tier.bucketSeconds} seconds', ts)`;
    await c.run(
      `INSERT INTO ${tier.target}
         SELECT ${bucketSql} AS ts, kind, instance_id, metric,
                min(min_v) AS min_v,
                max(max_v) AS max_v,
                sum(avg_v * sample_count) / sum(sample_count) AS avg_v,
                arg_max(last_v, ts) AS last_v,
                sum(sample_count) AS sample_count
         FROM ${tier.source}
         WHERE ts > ?
         GROUP BY ${bucketSql}, kind, instance_id, metric
         HAVING ${bucketSql} < date_trunc('second', now())`,
      [toTs(lastBucket)],
    );
  };

  const getLastBucket = async (c: DuckDBConnection, tier: TierName): Promise<Date> => {
    const res = await c.runAndReadAll('SELECT epoch_ms(last_bucket) AS ms FROM rollup_state WHERE tier = ?', [tier]);
    const rows = res.getRowObjects() as Array<{ ms?: unknown }>;
    if (rows.length === 0) return new Date(0);
    const v = rows[0]?.ms;
    const ms = typeof v === 'bigint' ? Number(v) : Number(v);
    return new Date(Number.isFinite(ms) ? ms : 0);
  };

  const updateLastBucket = async (c: DuckDBConnection, tier: TierName, latest: Date): Promise<void> => {
    await c.run(
      `INSERT INTO rollup_state (tier, last_bucket) VALUES (?, ?)
       ON CONFLICT (tier) DO UPDATE SET last_bucket = excluded.last_bucket`,
      [tier, toTs(latest)],
    );
  };

  const latestBucketInTarget = async (c: DuckDBConnection, tier: TierConfig): Promise<Date | null> => {
    const res = await c.runAndReadAll(`SELECT epoch_ms(max(ts)) AS m FROM ${tier.target}`);
    const rows = res.getRowObjects() as Array<{ m?: unknown }>;
    const v = rows[0]?.m;
    if (v == null) return null;
    const ms = typeof v === 'bigint' ? Number(v) : Number(v);
    if (!Number.isFinite(ms)) return null;
    return new Date(ms);
  };

  const pruneTable = async (c: DuckDBConnection, table: string, retentionMs: number): Promise<void> => {
    const cutoff = new Date(opts.clock.now() - retentionMs);
    await c.run(`DELETE FROM ${table} WHERE ts < ?`, [toTs(cutoff)]);
  };

  const runTier = async (tier: TierConfig): Promise<void> => {
    if (!conn) return;
    const c = conn;
    try {
      const last = await getLastBucket(c, tier.name);
      if (tier.sourceIsRaw) await rollupFromRaw(c, tier, last);
      else await rollupFromAgg(c, tier, last);
      const latest = await latestBucketInTarget(c, tier);
      if (latest) await updateLastBucket(c, tier.name, latest);
      await pruneTable(c, tier.source, tier.pruneSourceMs);
      await pruneTable(c, tier.target, tier.pruneTargetMs);
    } catch (err) {
      opts.logger.error({ err, tier: tier.name }, 'rollup tier failed');
    }
  };

  const schedule = (tier: TierConfig): void => {
    const interval = opts.tickMsOverrides?.[tier.name] ?? tier.tickMs;
    let cancelled = false;
    let cancelTimer: (() => void) | null = null;
    const tick = async (): Promise<void> => {
      if (cancelled) return;
      await runTier(tier);
      if (cancelled) return;
      cancelTimer = opts.clock.setTimeout(() => { void tick(); }, interval);
    };
    cancelTimer = opts.clock.setTimeout(() => { void tick(); }, interval);
    cancelers.push(() => { cancelled = true; cancelTimer?.(); });
  };

  return {
    async start(): Promise<void> {
      if (running) return;
      running = true;
      conn = await opts.pool.connect();
      for (const tier of TIERS) schedule(tier);
    },
    async stop(): Promise<void> {
      running = false;
      for (const c of cancelers) c();
      cancelers.length = 0;
    },
    async runOnce(tierName: TierName): Promise<void> {
      const tier = TIERS.find((t) => t.name === tierName);
      if (!tier) return;
      if (!conn) conn = await opts.pool.connect();
      await runTier(tier);
    },
  };
}
