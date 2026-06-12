import { describe, it, expect, vi } from "vitest";
import { ttlMemo } from "./ttlMemo.js";

const signal = () => new AbortController().signal;

describe("ttlMemo", () => {
  it("serves the cached value within the ttl and refetches after expiry", async () => {
    let t = 0;
    let n = 0;
    const memo = ttlMemo(
      1000,
      () => t,
      async () => ++n
    );

    expect(await memo(signal())).toBe(1);
    t = 500;
    expect(await memo(signal())).toBe(1);
    t = 1500;
    expect(await memo(signal())).toBe(2);
  });

  it("shares one in-flight fetch across concurrent callers", async () => {
    const fetcher = vi.fn(async () => {
      await new Promise((r) => setImmediate(r));
      return "v";
    });
    const memo = ttlMemo(1000, () => 0, fetcher);
    const [a, b] = await Promise.all([memo(signal()), memo(signal())]);
    expect(a).toBe("v");
    expect(b).toBe("v");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("serves the stale value when a refresh fails", async () => {
    let t = 0;
    let fail = false;
    const memo = ttlMemo(
      1000,
      () => t,
      async () => {
        if (fail) throw new Error("down");
        return "fresh";
      }
    );

    expect(await memo(signal())).toBe("fresh");
    t = 2000;
    fail = true;
    expect(await memo(signal())).toBe("fresh");
  });

  it("propagates the error when there is no cached value", async () => {
    const memo = ttlMemo(
      1000,
      () => 0,
      async () => {
        throw new Error("down");
      }
    );
    await expect(memo(signal())).rejects.toThrow("down");
    // and retries on the next call rather than caching the failure
    await expect(memo(signal())).rejects.toThrow("down");
  });
});
