import { describe, it, expect } from "vitest";
import { IpfsInstanceSchema, TorInstanceSchema } from "./services.js";

describe("TorInstanceSchema", () => {
  it("rejects a control password with a line break (control command injection)", () => {
    expect(
      TorInstanceSchema.safeParse({
        kind: "tor",
        controlPassword: 'pw"\r\nSIGNAL SHUTDOWN',
      }).success
    ).toBe(false);
    expect(
      TorInstanceSchema.safeParse({ kind: "tor", controlPassword: "a\nb" })
        .success
    ).toBe(false);
    expect(
      TorInstanceSchema.safeParse({ kind: "tor", controlPassword: 'p"w\\d' })
        .success
    ).toBe(true);
  });

  it("metricsUrl defaults to empty and accepts only a URL otherwise", () => {
    const parsed = TorInstanceSchema.parse({ kind: "tor" });
    expect(parsed.metricsUrl).toBe("");
    expect(
      TorInstanceSchema.safeParse({
        kind: "tor",
        metricsUrl: "http://127.0.0.1:9035/metrics",
      }).success
    ).toBe(true);
    expect(
      TorInstanceSchema.safeParse({ kind: "tor", metricsUrl: "not a url" })
        .success
    ).toBe(false);
  });
});

describe("IpfsInstanceSchema", () => {
  it("apiAuth is optional and empty by default", () => {
    expect(IpfsInstanceSchema.parse({ kind: "ipfs" }).apiAuth).toBe("");
  });
});
