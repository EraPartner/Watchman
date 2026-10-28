import { describe, expect, it } from "vitest";
import { readConnectionTest } from "./connectionTest";

describe("readConnectionTest", () => {
  it("passes a reachable snapshot", () => {
    expect(
      readConnectionTest({
        ok: true,
        latencyMs: 12,
        snapshot: { reachable: true },
      })
    ).toEqual({ ok: true, latencyMs: 12 });
  });

  it("fails an ok result whose snapshot is unreachable", () => {
    expect(
      readConnectionTest({
        ok: true,
        latencyMs: 30,
        snapshot: { reachable: false, message: "ECONNREFUSED" },
      })
    ).toEqual({ ok: false, latencyMs: 30, error: "ECONNREFUSED" });
  });

  it("gives a default reason when the snapshot has no message", () => {
    expect(
      readConnectionTest({
        ok: true,
        latencyMs: 1,
        snapshot: { reachable: false },
      }).error
    ).toBe("service unreachable");
  });

  it("uses the error of a failed result", () => {
    expect(
      readConnectionTest({
        ok: false,
        latencyMs: 5,
        error: { code: "UNAVAILABLE", message: "connection refused" },
      })
    ).toEqual({ ok: false, latencyMs: 5, error: "connection refused" });
  });

  it("treats an ok result without a snapshot as passed", () => {
    expect(readConnectionTest({ ok: true, latencyMs: 2 }).ok).toBe(true);
  });
});
