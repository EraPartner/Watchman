import { describe, it, expect } from "vitest";
import { MAX_PAIR_TIMEOUT_MS, parsePairBody } from "./setup.js";

describe("parsePairBody", () => {
  it("accepts an IPv4 address, hostname or bracketed IPv6 literal", () => {
    for (const host of ["192.168.1.50", "hue-bridge.local", "[fe80::1]"]) {
      expect(parsePairBody({ host })).toEqual({
        ok: true,
        host,
        timeoutMs: 10_000,
      });
    }
  });

  it("trims surrounding whitespace from host", () => {
    expect(parsePairBody({ host: "  192.168.1.50 " })).toMatchObject({
      ok: true,
      host: "192.168.1.50",
    });
  });

  it.each([
    ["missing", {}],
    ["empty", { host: "" }],
    ["blank", { host: "   " }],
    ["not a string", { host: 42 }],
    ["a URL with scheme", { host: "https://192.168.1.50" }],
    ["with a port", { host: "192.168.1.50:8443" }],
    ["with a path", { host: "192.168.1.50/api" }],
    ["with credentials", { host: "user@192.168.1.50" }],
    ["with inner whitespace", { host: "hue bridge" }],
  ])("rejects host %s", (_label, body) => {
    expect(parsePairBody(body)).toMatchObject({ ok: false });
  });

  it("rejects a null body", () => {
    expect(parsePairBody(null)).toEqual({
      ok: false,
      message: "host is required",
    });
  });

  it("keeps a timeoutMs within the cap", () => {
    expect(
      parsePairBody({ host: "192.168.1.50", timeoutMs: 3000 })
    ).toMatchObject({ ok: true, timeoutMs: 3000 });
    expect(
      parsePairBody({ host: "192.168.1.50", timeoutMs: MAX_PAIR_TIMEOUT_MS })
    ).toMatchObject({ ok: true, timeoutMs: MAX_PAIR_TIMEOUT_MS });
  });

  it.each([
    ["above the cap", MAX_PAIR_TIMEOUT_MS + 1],
    ["zero", 0],
    ["negative", -5],
    ["fractional", 1.5],
    ["a string", "5000"],
  ])("rejects timeoutMs %s", (_label, timeoutMs) => {
    const result = parsePairBody({ host: "192.168.1.50", timeoutMs });
    expect(result).toMatchObject({ ok: false });
    if (!result.ok) expect(result.message).toMatch(/^timeoutMs: /);
  });

  it("keeps two attempts at the cap under the UI's 25 s request timeout", () => {
    expect(2 * MAX_PAIR_TIMEOUT_MS).toBeLessThan(25_000);
  });
});
