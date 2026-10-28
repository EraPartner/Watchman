import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";

const holder = vi.hoisted(() => ({ current: null as unknown }));

vi.mock("pigpio-client", () => ({
  default: { pigpio: () => holder.current },
}));

import { createPigpioClient } from "./pigpioClientImpl.js";

class FakePi extends EventEmitter {
  end = vi.fn((cb?: () => void) => cb?.());
  getInfo = () => ({ pigpioVersion: 79, hwVersion: 0xa22082 });
  getCurrentTick = (cb: (err: Error | null, tick: number) => void) =>
    cb(null, 1234);
  gpio = () => ({
    read: (cb: (err: Error | null, v: number) => void) => cb(null, 1),
  });
}

const REQ = { host: "pi.local", port: 8888, timeoutMs: 1000 };

describe("createPigpioClient", () => {
  it("ends the client when the connect times out", async () => {
    vi.useFakeTimers();
    try {
      const pi = new FakePi();
      holder.current = pi;
      const p = createPigpioClient().connect(REQ);
      const assertion = expect(p).rejects.toMatchObject({ code: "TIMEOUT" });
      await vi.advanceTimersByTimeAsync(REQ.timeoutMs);
      await assertion;
      expect(pi.end).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ends the client when the connect errors", async () => {
    const pi = new FakePi();
    holder.current = pi;
    const p = createPigpioClient().connect(REQ);
    pi.emit("error", new Error("ECONNREFUSED"));
    await expect(p).rejects.toMatchObject({ code: "UNAVAILABLE" });
    expect(pi.end).toHaveBeenCalledTimes(1);
  });

  it("a socket error after connect does not throw and fails later commands", async () => {
    const pi = new FakePi();
    holder.current = pi;
    const p = createPigpioClient().connect(REQ);
    pi.emit("connected");
    const h = await p;
    expect(await h.getCurrentTick()).toBe(1234);

    // with no listener EventEmitter would throw ERR_UNHANDLED_ERROR here
    expect(() => pi.emit("error", new Error("ECONNRESET"))).not.toThrow();
    await expect(h.getCurrentTick()).rejects.toThrow("connection lost");
  });
});
