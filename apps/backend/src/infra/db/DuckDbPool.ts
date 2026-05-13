import { DuckDBInstance, DuckDBTimestampValue, type DuckDBConnection } from '@duckdb/node-api';

export const toTs = (d: Date): DuckDBTimestampValue =>
  new DuckDBTimestampValue(BigInt(d.getTime()) * 1000n);

export interface DuckDbPoolOptions {
  path: string;
}

export interface DuckDbPool {
  connect(): Promise<DuckDBConnection>;
  close(): Promise<void>;
}

export async function createDuckDbPool(opts: DuckDbPoolOptions): Promise<DuckDbPool> {
  const instance = await DuckDBInstance.create(opts.path);
  const connections: DuckDBConnection[] = [];
  let closed = false;

  return {
    async connect(): Promise<DuckDBConnection> {
      if (closed) throw new Error('DuckDbPool closed');
      const conn = await instance.connect();
      connections.push(conn);
      return conn;
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      for (const c of connections) {
        try {
          c.closeSync();
        } catch {
          // ignore
        }
      }
      connections.length = 0;
      try {
        instance.closeSync();
      } catch {
        // Releases the DuckDB file lock; ignore double-close.
      }
    },
  };
}
