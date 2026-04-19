import { DuckDBInstance, type DuckDBConnection } from '@duckdb/node-api';

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
    },
  };
}
