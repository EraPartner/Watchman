import {
  DuckDBInstance,
  DuckDBTimestampValue,
  type DuckDBConnection,
} from "@duckdb/node-api";

export const toTs = (d: Date): DuckDBTimestampValue =>
  new DuckDBTimestampValue(BigInt(d.getTime()) * 1000n);

const NAIVE_TS = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/;

/**
 * Inverse of toTs for values read back from a TIMESTAMP column. DuckDB
 * TIMESTAMP is zone-less and toTs stores UTC epoch micros, so read the micros
 * directly; never `new Date(String(v))`, which parses the naive
 * "YYYY-MM-DD HH:MM:SS.ffffff" text as host-local time.
 */
export function fromTs(v: unknown): Date {
  if (v instanceof Date) return v;
  if (
    v instanceof DuckDBTimestampValue ||
    (typeof v === "object" &&
      v !== null &&
      typeof (v as { micros?: unknown }).micros === "bigint")
  ) {
    return new Date(Number((v as { micros: bigint }).micros / 1000n));
  }
  if (typeof v === "bigint") return new Date(Number(v / 1000n));
  const s = String(v);
  const naive = NAIVE_TS.exec(s);
  if (naive) return new Date(`${naive[1]}T${naive[2]}Z`);
  return new Date(s);
}

export interface DuckDbPoolOptions {
  path: string;
  /** Maximum simultaneously borrowed connections (default 4). */
  maxSize?: number;
}

export interface DuckDbPool {
  /** Borrow a connection. Must be returned with release(), not closed. */
  connect(): Promise<DuckDBConnection>;
  /** Return a borrowed connection to the pool for reuse. */
  release(conn: DuckDBConnection): void;
  /** Borrow, run, release. Preferred over manual connect/release. */
  withConnection<T>(fn: (c: DuckDBConnection) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export async function createDuckDbPool(
  opts: DuckDbPoolOptions
): Promise<DuckDbPool> {
  const instance = await DuckDBInstance.create(opts.path);
  const maxSize = opts.maxSize ?? 4;
  const idle: DuckDBConnection[] = [];
  const borrowed = new Set<DuckDBConnection>();
  const waiters: Array<{
    resolve: (c: DuckDBConnection) => void;
    reject: (e: Error) => void;
  }> = [];
  let closed = false;
  // Connections being opened but not yet in `borrowed`. Counted against maxSize
  // so concurrent connect() calls can't all pass the size check before the
  // first instance.connect() resolves.
  let opening = 0;

  async function connect(): Promise<DuckDBConnection> {
    if (closed) throw new Error("DuckDbPool closed");
    const reused = idle.pop();
    if (reused) {
      borrowed.add(reused);
      return reused;
    }
    if (borrowed.size + opening < maxSize) {
      opening += 1;
      let conn: DuckDBConnection;
      try {
        conn = await instance.connect();
      } finally {
        opening -= 1;
      }
      borrowed.add(conn);
      return conn;
    }
    return new Promise<DuckDBConnection>((resolve, reject) => {
      waiters.push({
        resolve: (c) => {
          borrowed.add(c);
          resolve(c);
        },
        reject,
      });
    });
  }

  function release(conn: DuckDBConnection): void {
    if (!borrowed.delete(conn)) return;
    if (closed) {
      try {
        conn.closeSync();
      } catch {
        // ignore
      }
      return;
    }
    const waiter = waiters.shift();
    if (waiter) waiter.resolve(conn);
    else idle.push(conn);
  }

  return {
    connect,
    release,
    async withConnection<T>(
      fn: (c: DuckDBConnection) => Promise<T>
    ): Promise<T> {
      const conn = await connect();
      try {
        return await fn(conn);
      } finally {
        release(conn);
      }
    },
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      for (const w of waiters.splice(0))
        w.reject(new Error("DuckDbPool closed"));
      for (const c of [...idle, ...borrowed]) {
        try {
          c.closeSync();
        } catch {
          // ignore
        }
      }
      idle.length = 0;
      borrowed.clear();
      try {
        instance.closeSync();
      } catch {
        // Releases the DuckDB file lock; ignore double-close.
      }
    },
  };
}
