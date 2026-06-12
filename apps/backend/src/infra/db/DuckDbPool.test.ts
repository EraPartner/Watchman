import { describe, it, expect } from "vitest";
import { createDuckDbPool } from "./DuckDbPool.js";

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
});
