import type { DuckDbPool } from './DuckDbPool.js';
import type { DuckDBConnection, DuckDBTimestampValue } from '@duckdb/node-api';
import { toTs } from './duckdbTime.js';

export type Resolution = 'raw' | '1m' | '5m' | '1h';
export type Aggregation = 'avg' | 'min' | 'max' | 'last';

export interface HistoryQuery {
  kind: string;
  instanceId?: string | undefined;
  metric: string;
  from: Date;
  to: Date;
  resolution: Resolution;
  agg?: Aggregation | undefined;
  limit?: number | undefined;
}

export interface HistoryPoint {
  t: number;
  v: number | null;
  min?: number | null;
  max?: number | null;
}

export interface TimeSeriesReader {
  query(q: HistoryQuery): Promise<HistoryPoint[]>;
}

const TABLE: Record<Resolution, string> = {
  raw: 'metric_raw',
  '1m': 'metric_1m',
  '5m': 'metric_5m',
  '1h': 'metric_1h',
};

const DEFAULT_LIMIT = 20_000;

export function createTimeSeriesReader(pool: DuckDbPool): TimeSeriesReader {
  let conn: DuckDBConnection | null = null;

  const getConn = async (): Promise<DuckDBConnection> => {
    if (!conn) conn = await pool.connect();
    return conn;
  };

  const toPoint = (row: Record<string, unknown>, resolution: Resolution, agg: Aggregation): HistoryPoint => {
    const tsVal = row['ts'];
    const ts = tsVal instanceof Date ? tsVal.getTime() : Number(tsVal);
    if (resolution === 'raw') {
      const v = row['value_num'];
      return { t: ts, v: v == null ? null : Number(v) };
    }
    const col = agg === 'avg' ? 'avg_v' : agg === 'min' ? 'min_v' : agg === 'max' ? 'max_v' : 'last_v';
    return {
      t: ts,
      v: row[col] == null ? null : Number(row[col]),
      min: row['min_v'] == null ? null : Number(row['min_v']),
      max: row['max_v'] == null ? null : Number(row['max_v']),
    };
  };

  return {
    async query(q: HistoryQuery): Promise<HistoryPoint[]> {
      const table = TABLE[q.resolution];
      const agg: Aggregation = q.agg ?? 'avg';
      const limit = q.limit ?? DEFAULT_LIMIT;
      const c = await getConn();
      const params: Array<string | DuckDBTimestampValue | number> = [q.kind, q.metric, toTs(q.from), toTs(q.to)];
      let where = 'kind = ? AND metric = ? AND ts >= ? AND ts < ?';
      if (q.instanceId) {
        where += ' AND instance_id = ?';
        params.push(q.instanceId);
      }
      const sql = `SELECT * FROM ${table} WHERE ${where} ORDER BY ts ASC LIMIT ${Math.floor(limit)}`;
      const result = await c.runAndReadAll(sql, params);
      const rows = result.getRowObjects() as Array<Record<string, unknown>>;
      return rows.map((r) => toPoint(r, q.resolution, agg));
    },
  };
}

export function autoResolution(fromMs: number, toMs: number): Resolution {
  const span = toMs - fromMs;
  const hour = 3_600_000;
  if (span <= hour) return 'raw';
  if (span <= 24 * hour) return '1m';
  if (span <= 7 * 24 * hour) return '5m';
  return '1h';
}
