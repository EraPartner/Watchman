import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import pino from 'pino';
import { createDuckDbPool, type DuckDbPool } from './DuckDbPool.js';
import { runMigrations } from './migrations.js';
import { createTimeSeriesWriter } from './TimeSeriesWriter.js';
import { createTimeSeriesReader } from './TimeSeriesReader.js';
import { createRollupWorker } from './RollupWorker.js';
import { createEventBus } from '../../core/eventBus.js';
import { createFakeClock } from '../../core/clock.js';
import { toTs } from './duckdbTime.js';

const silentLogger = pino({ level: 'silent' });

async function makePool(): Promise<{ pool: DuckDbPool; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'watchman-ts-'));
  const pool = await createDuckDbPool({ path: join(dir, 'db.duckdb') });
  const conn = await pool.connect();
  await runMigrations(conn);
  return { pool, dir };
}

describe('migrations', () => {
  let pool: DuckDbPool;
  let dir: string;

  beforeEach(async () => {
    ({ pool, dir } = await makePool());
  });
  afterEach(async () => {
    await pool.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('creates all timeseries tables', async () => {
    const c = await pool.connect();
    const res = await c.runAndReadAll(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name",
    );
    const names = res.getRowObjects().map((r) => String(r['table_name']));
    expect(names).toEqual(['metric_1h', 'metric_1m', 'metric_5m', 'metric_raw', 'rollup_state']);
  });

  it('is idempotent', async () => {
    const c = await pool.connect();
    await runMigrations(c);
    await runMigrations(c);
    const res = await c.runAndReadAll('SELECT count(*) AS n FROM metric_raw');
    expect(Number(res.getRowObjects()[0]!['n'])).toBe(0);
  });
});

describe('TimeSeriesWriter + Reader', () => {
  let pool: DuckDbPool;
  let dir: string;

  beforeEach(async () => {
    ({ pool, dir } = await makePool());
  });
  afterEach(async () => {
    await pool.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('flushes on stats event batches and reader returns raw points', async () => {
    const bus = createEventBus();
    const clock = createFakeClock(1_700_000_000_000);
    const writer = createTimeSeriesWriter({ pool, bus, clock, logger: silentLogger, flushMs: 1000, maxBatch: 500 });
    await writer.start();

    bus.emit('service.stats.updated', {
      id: 'bitcoin:main',
      kind: 'bitcoin',
      instanceId: 'main',
      at: clock.now(),
      snapshot: { metrics: { blocks: 800_000, syncing: true, chain: 'main' }, at: clock.now() },
    });
    bus.emit('service.stats.updated', {
      id: 'bitcoin:main',
      kind: 'bitcoin',
      instanceId: 'main',
      at: clock.now() + 1,
      snapshot: { metrics: { blocks: 800_001 }, at: clock.now() + 1 },
    });

    await writer.flush();

    const reader = createTimeSeriesReader(pool);
    const points = await reader.query({
      kind: 'bitcoin',
      instanceId: 'main',
      metric: 'blocks',
      from: new Date(clock.now() - 60_000),
      to: new Date(clock.now() + 60_000),
      resolution: 'raw',
    });
    expect(points.length).toBe(2);
    expect(points[0]!.v).toBe(800_000);
    expect(points[1]!.v).toBe(800_001);

    await writer.stop();
  });

  it('drops non-finite numeric values', async () => {
    const bus = createEventBus();
    const clock = createFakeClock(1_700_000_000_000);
    const writer = createTimeSeriesWriter({ pool, bus, clock, logger: silentLogger });
    await writer.start();
    bus.emit('service.stats.updated', {
      id: 'x:a',
      kind: 'x',
      instanceId: 'a',
      at: clock.now(),
      snapshot: { metrics: { good: 1, bad: Number.NaN, inf: Number.POSITIVE_INFINITY }, at: clock.now() },
    });
    await writer.flush();
    const c = await pool.connect();
    const res = await c.runAndReadAll('SELECT metric FROM metric_raw ORDER BY metric');
    const metrics = res.getRowObjects().map((r) => r['metric']);
    expect(metrics).toEqual(['good']);
    await writer.stop();
  });

  it('filters by instanceId when provided', async () => {
    const bus = createEventBus();
    const clock = createFakeClock(1_700_000_000_000);
    const writer = createTimeSeriesWriter({ pool, bus, clock, logger: silentLogger });
    await writer.start();
    bus.emit('service.stats.updated', {
      id: 'k:a', kind: 'k', instanceId: 'a', at: clock.now(),
      snapshot: { metrics: { m: 1 }, at: clock.now() },
    });
    bus.emit('service.stats.updated', {
      id: 'k:b', kind: 'k', instanceId: 'b', at: clock.now(),
      snapshot: { metrics: { m: 2 }, at: clock.now() },
    });
    await writer.flush();

    const reader = createTimeSeriesReader(pool);
    const only = await reader.query({
      kind: 'k', instanceId: 'b', metric: 'm',
      from: new Date(clock.now() - 1000), to: new Date(clock.now() + 1000),
      resolution: 'raw',
    });
    expect(only.length).toBe(1);
    expect(only[0]!.v).toBe(2);

    const all = await reader.query({
      kind: 'k', metric: 'm',
      from: new Date(clock.now() - 1000), to: new Date(clock.now() + 1000),
      resolution: 'raw',
    });
    expect(all.length).toBe(2);

    await writer.stop();
  });
});

describe('RollupWorker', () => {
  let pool: DuckDbPool;
  let dir: string;

  beforeEach(async () => {
    ({ pool, dir } = await makePool());
  });
  afterEach(async () => {
    await pool.close();
    await rm(dir, { recursive: true, force: true });
  });

  it('rolls raw → 1m buckets with min/max/avg/last', async () => {
    const c = await pool.connect();
    const base = Date.UTC(2024, 0, 1, 0, 0, 0);
    // Three samples in same 60s bucket, one in next
    const rows: Array<[number, number]> = [
      [base + 0, 10],
      [base + 10_000, 20],
      [base + 30_000, 30],
      [base + 60_000, 100],
    ];
    for (const [ts, v] of rows) {
      await c.run(
        "INSERT INTO metric_raw VALUES (?, 'k', 'a', 'm', ?, NULL, NULL)",
        [toTs(new Date(ts)), v],
      );
    }

    const clock = createFakeClock(base + 300_000);
    const worker = createRollupWorker({ pool, clock, logger: silentLogger });
    await worker.runOnce('1m');

    const res = await c.runAndReadAll('SELECT ts, min_v, max_v, avg_v, last_v, sample_count FROM metric_1m ORDER BY ts');
    const got = res.getRowObjects();
    expect(got.length).toBeGreaterThanOrEqual(2);
    const first = got[0]!;
    expect(Number(first['min_v'])).toBe(10);
    expect(Number(first['max_v'])).toBe(30);
    expect(Number(first['avg_v'])).toBeCloseTo(20, 5);
    expect(Number(first['last_v'])).toBe(30);
    expect(Number(first['sample_count'])).toBe(3);
  });

  it('rolls 1m → 5m aggregates weighted avg', async () => {
    const c = await pool.connect();
    const base = Date.UTC(2024, 0, 1, 0, 0, 0);
    // Two 1m buckets in same 5m window: [avg=10,n=2] + [avg=20,n=3] → weighted avg 16
    await c.run(
      "INSERT INTO metric_1m VALUES (?, 'k','a','m', 5, 15, 10, 12, 2)",
      [toTs(new Date(base))],
    );
    await c.run(
      "INSERT INTO metric_1m VALUES (?, 'k','a','m', 15, 25, 20, 22, 3)",
      [toTs(new Date(base + 60_000))],
    );

    const clock = createFakeClock(base + 600_000);
    const worker = createRollupWorker({ pool, clock, logger: silentLogger });
    await worker.runOnce('5m');
    const res = await c.runAndReadAll('SELECT min_v, max_v, avg_v, sample_count FROM metric_5m');
    const row = res.getRowObjects()[0]!;
    expect(Number(row['min_v'])).toBe(5);
    expect(Number(row['max_v'])).toBe(25);
    expect(Number(row['avg_v'])).toBeCloseTo(16, 5);
    expect(Number(row['sample_count'])).toBe(5);
  });

  it('advances rollup_state watermark', async () => {
    const c = await pool.connect();
    const base = Date.UTC(2024, 0, 1, 0, 0, 0);
    await c.run(
      "INSERT INTO metric_raw VALUES (?, 'k','a','m', 1, NULL, NULL)",
      [toTs(new Date(base))],
    );
    const clock = createFakeClock(base + 300_000);
    const worker = createRollupWorker({ pool, clock, logger: silentLogger });
    await worker.runOnce('1m');

    const r = await c.runAndReadAll("SELECT last_bucket FROM rollup_state WHERE tier='1m'");
    const rows = r.getRowObjects();
    expect(rows.length).toBe(1);
    expect(rows[0]!['last_bucket']).toBeTruthy();
  });
});

describe('autoResolution', () => {
  it('picks resolution by window size', async () => {
    const { autoResolution } = await import('./TimeSeriesReader.js');
    const hour = 3_600_000;
    expect(autoResolution(0, hour)).toBe('raw');
    expect(autoResolution(0, 12 * hour)).toBe('1m');
    expect(autoResolution(0, 3 * 24 * hour)).toBe('5m');
    expect(autoResolution(0, 20 * 24 * hour)).toBe('1h');
  });
});
