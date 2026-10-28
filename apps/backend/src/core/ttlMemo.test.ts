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
  });

  it("remembers a failure for min(ttl, 60s) before calling the fetcher again", async () => {
    let t = 0;
    let fail = true;
    const fetcher = vi.fn(async () => {
      if (fail) throw new Error("down");
      return "ok";
    });
    const memo = ttlMemo(10 * 60_000, () => t, fetcher);

    await expect(memo(signal())).rejects.toThrow("down");
    t = 30_000;
    await expect(memo(signal())).rejects.toThrow("down");
    expect(fetcher).toHaveBeenCalledTimes(1);

    t = 60_000;
    fail = false;
    expect(await memo(signal())).toBe("ok");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("serves the stale value during the failure window without refetching", async () => {
    let t = 0;
    let fail = false;
    const fetcher = vi.fn(async () => {
      if (fail) throw new Error("down");
      return "fresh";
    });
    const memo = ttlMemo(1000, () => t, fetcher);

    expect(await memo(signal())).toBe("fresh");
    fail = true;
    t = 2000;
    expect(await memo(signal())).toBe("fresh");
    t = 2500;
    expect(await memo(signal())).toBe("fresh");
    expect(fetcher).toHaveBeenCalledTimes(2);
    t = 3000;
    await memo(signal());
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("does not remember a failure caused by the caller aborting", async () => {
    let fail = true;
    const fetcher = vi.fn(async () => {
      if (fail) throw new Error("aborted");
      return "ok";
    });
    const memo = ttlMemo(1000, () => 0, fetcher);
    const ac = new AbortController();
    ac.abort();
    await expect(memo(ac.signal)).rejects.toThrow("aborted");
    fail = false;
    expect(await memo(signal())).toBe("ok");
  });
});
