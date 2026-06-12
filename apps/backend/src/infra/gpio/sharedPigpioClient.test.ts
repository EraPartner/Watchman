import { describe, it, expect, vi } from "vitest";
import { createSharedPigpioClient } from "./sharedPigpioClient.js";
import type { PigpioClient, PigpioHandle } from "./pigpioClient.js";

function fakeHandle(
  overrides: Partial<PigpioHandle> = {}
): PigpioHandle & { ended: () => boolean } {
  let ended = false;
  return {
    read: async () => 1,
    write: async () => undefined,
    setMode: async () => undefined,
    getHardwareRevision: async () => 42,
    getPigpioVersion: async () => 79,
    getCurrentTick: async () => 1000,
    end: async () => {
      ended = true;
    },
    ended: () => ended,
    ...overrides,
  };
}

const REQ = { host: "pi.local", port: 8888, timeoutMs: 1000 };

describe("createSharedPigpioClient", () => {
  it("reuses one underlying connection across connect() calls", async () => {
    const connect = vi.fn(async () => fakeHandle());
    const client = createSharedPigpioClient({ connect } as PigpioClient);

    const a = await client.connect(REQ);
    const b = await client.connect(REQ);
    await a.getCurrentTick();
    await b.getHardwareRevision();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("end() on a handed-out handle does not close the shared connection", async () => {
    const inner = fakeHandle();
    const connect = vi.fn(async () => inner);
    const client = createSharedPigpioClient({ connect } as PigpioClient);

    const h = await client.connect(REQ);
    await h.end();
    expect(inner.ended()).toBe(false);
    await h.getCurrentTick();
    expect(connect).toHaveBeenCalledTimes(1);
  });

  it("reconnects after a command failure", async () => {
    const bad = fakeHandle({
      getCurrentTick: async () => {
        throw new Error("broken pipe");
      },
    });
    const good = fakeHandle();
    const connect = vi
      .fn<() => Promise<PigpioHandle>>()
      .mockResolvedValueOnce(bad)
      .mockResolvedValueOnce(good);
    const client = createSharedPigpioClient({
      connect,
    } as unknown as PigpioClient);

    const h = await client.connect(REQ);
    await expect(h.getCurrentTick()).rejects.toThrow("broken pipe");
    await expect(h.getCurrentTick()).resolves.toBe(1000);
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("propagates connect failures and retries on next call", async () => {
    const connect = vi
      .fn<() => Promise<PigpioHandle>>()
      .mockRejectedValueOnce(new Error("refused"))
      .mockResolvedValueOnce(fakeHandle());
    const client = createSharedPigpioClient({
      connect,
    } as unknown as PigpioClient);

    await expect(client.connect(REQ)).rejects.toThrow("refused");
    const h = await client.connect(REQ);
    await expect(h.getCurrentTick()).resolves.toBe(1000);
  });

  it("close() ends the underlying connection", async () => {
    const inner = fakeHandle();
    const client = createSharedPigpioClient({
      connect: async () => inner,
    } as PigpioClient);
    await client.connect(REQ);
    await client.close();
    expect(inner.ended()).toBe(true);
  });
});
