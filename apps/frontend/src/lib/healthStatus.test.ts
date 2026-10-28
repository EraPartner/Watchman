import { describe, expect, it } from "vitest";
import { healthStatus } from "./healthStatus";

describe("healthStatus", () => {
  it("is offline when the snapshot is unreachable", () => {
    expect(healthStatus({ reachable: false })).toBe("offline");
    expect(
      healthStatus({ reachable: false, host: { reachable: true } })
    ).toBe("offline");
  });

  it("is online when reachable with no tiers or all tiers up", () => {
    expect(healthStatus({ reachable: true })).toBe("online");
    expect(
      healthStatus({
        reachable: true,
        host: { reachable: true },
        service: { reachable: true },
      })
    ).toBe("online");
  });

  it("is warning when reachable but a tier is down", () => {
    expect(
      healthStatus({ reachable: true, host: { reachable: false } })
    ).toBe("warning");
    expect(
      healthStatus({ reachable: true, service: { reachable: false } })
    ).toBe("warning");
  });
});
