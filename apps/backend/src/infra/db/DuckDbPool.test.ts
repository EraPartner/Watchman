import { describe, it, expect } from "vitest";
import { DuckDBTimestampValue } from "@duckdb/node-api";
import { createDuckDbPool, fromTs, toTs } from "./DuckDbPool.js";

describe("DuckDbPool", () => {
  it("reuses released connections instead of growing unboundedly", async () => {
    const pool = await createDuckDbPool({ path: ":memory:" });
    const a = await pool.connect();
    pool.release(a);
    const b = await pool.connect();
    expect(b).toBe(a);
    pool.release(b);
    await pool.close();
  });

  it("withConnection releases back to the pool", async () => {
    const pool = await createDuckDbPool({ path: ":memory:" });
    let seen: unknown;
    await pool.withConnection(async (c) => {
      seen = c;
      await c.runAndReadAll("SELECT 1");
    });
    const again = await pool.connect();
    expect(again).toBe(seen);
    pool.release(again);
    await pool.close();
  });

  it("caps concurrent borrows at maxSize and queues waiters", async () => {
    const pool = await createDuckDbPool({ path: ":memory:", maxSize: 1 });
    const first = await pool.connect();
    let resolved = false;
    const waiting = pool.connect().then((c) => {
      resolved = true;
      return c;
    });
    await new Promise((r) => setImmediate(r));
    expect(resolved).toBe(false);
    pool.release(first);
    const second = await waiting;
    expect(second).toBe(first);
    pool.release(second);
    await pool.close();
  });

  it("caps concurrent first-time connects at maxSize", async () => {
    // Regression: the size check ran before the awaited instance.connect(), so
    // simultaneous callers on an empty pool all opened their own connection.
    const pool = await createDuckDbPool({ path: ":memory:", maxSize: 2 });
    let settled = 0;
    const pending = [pool.connect(), pool.connect(), pool.connect()].map((p) =>
      p.then((c) => {
        settled += 1;
        return c;
      })
    );
    const [a, b] = await Promise.all(pending.slice(0, 2));
    await new Promise((r) => setImmediate(r));
    expect(settled).toBe(2);
    expect(a).not.toBe(b);
    pool.release(a!);
    const c = await pending[2]!;
    expect(c).toBe(a);
    pool.release(b!);
    pool.release(c);
    await pool.close();
  });

  it("rejects connects after close", async () => {
    const pool = await createDuckDbPool({ path: ":memory:" });
    await pool.close();
    await expect(pool.connect()).rejects.toThrow(/closed/);
  });

  it("release after close closes the connection instead of pooling it", async () => {
    const pool = await createDuckDbPool({ path: ":memory:" });
    const a = await pool.connect();
    await pool.close();
    expect(() => pool.release(a)).not.toThrow();
  });

  describe("fromTs", () => {
    it("parses DuckDB's naive TIMESTAMP text as UTC, not host-local time", () => {
      expect(fromTs("2026-01-02 03:04:05.123456").toISOString()).toBe(
        "2026-01-02T03:04:05.123Z"
      );
      expect(fromTs("2026-01-02 03:04:05").toISOString()).toBe(
        "2026-01-02T03:04:05.000Z"
      );
    });

    it("reads a timestamp value from its epoch micros", () => {
      const d = new Date("2026-01-02T03:04:05.123Z");
      expect(fromTs(toTs(d)).toISOString()).toBe(d.toISOString());
      expect(fromTs({ micros: 1_767_323_045_123_456n }).toISOString()).toBe(
        "2026-01-02T03:04:05.123Z"
      );
      expect(
        fromTs(new DuckDBTimestampValue(1_767_323_045_123_456n)).toISOString()
      ).toBe("2026-01-02T03:04:05.123Z");
    });

    it("round-trips a TIMESTAMP column through DuckDB unchanged", async () => {
      const pool = await createDuckDbPool({ path: ":memory:" });
      const d = new Date("2026-07-15T12:34:56.789Z");
      const row = await pool.withConnection(async (c) => {
        await c.run("CREATE TABLE t (ts TIMESTAMP NOT NULL)");
        await c.run("INSERT INTO t VALUES (?)", [toTs(d)]);
        const r = await c.runAndReadAll("SELECT ts FROM t");
        return r.getRowObjects()[0]!;
      });
      expect(fromTs(row["ts"]).toISOString()).toBe(d.toISOString());
      await pool.close();
    });
  });
});
