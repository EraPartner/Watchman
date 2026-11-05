import { describe, it, expect } from "vitest";
import { UnauthorizedError } from "../../core/errors.js";
import { createAuthGate } from "./authGate.js";

function clock(start = 1_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("createAuthGate", () => {
  it("lets requests through until a credential is rejected", () => {
    const c = clock();
    const gate = createAuthGate({ now: c.now, label: "svc" });
    expect(() => gate.check()).not.toThrow();
  });

  it("blocks for the backoff after the first rejection, then allows one retry", () => {
    const c = clock();
    const gate = createAuthGate({ now: c.now, label: "svc", backoffMs: 1_000 });
    const first = new UnauthorizedError("bad password");
    gate.reject(first);
    expect(() => gate.check()).toThrow(first);
    c.advance(999);
    expect(() => gate.check()).toThrow(first);
    c.advance(1);
    expect(() => gate.check()).not.toThrow();
    expect(gate.stopped).toBe(false);
  });

  it("stops for good after repeated rejections, regardless of time", () => {
    const c = clock();
    const gate = createAuthGate({ now: c.now, label: "svc", backoffMs: 1_000 });
    gate.reject(new UnauthorizedError("bad password"));
    c.advance(1_000);
    gate.reject(new UnauthorizedError("bad password"));
    expect(gate.stopped).toBe(true);
    c.advance(24 * 60 * 60 * 1000);
    expect(() => gate.check()).toThrow(/stopped trying.*save the credentials/);
  });

  it("does not count parallel rejections that arrive while already blocked", () => {
    const c = clock();
    const gate = createAuthGate({ now: c.now, label: "svc" });
    gate.reject(new UnauthorizedError("401"));
    gate.reject(new UnauthorizedError("401"));
    gate.reject(new UnauthorizedError("401"));
    expect(gate.stopped).toBe(false);
  });

  it("an accepted credential resets the count", () => {
    const c = clock();
    const gate = createAuthGate({ now: c.now, label: "svc", backoffMs: 10 });
    gate.reject(new UnauthorizedError("401"));
    c.advance(10);
    gate.accept();
    gate.reject(new UnauthorizedError("401"));
    expect(gate.stopped).toBe(false);
  });
});
