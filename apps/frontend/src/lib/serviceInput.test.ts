import { describe, expect, it } from "vitest";
import { toggleEnabledInput } from "./serviceInput";

describe("toggleEnabledInput", () => {
  const svc = {
    instanceId: "main",
    enabled: true,
    config: {
      kind: "ipfs",
      instanceId: "main",
      enabled: true,
      apiUrl: "http://127.0.0.1:5001",
      apiKey: "***",
    },
  };

  it("keeps the stored config so the PUT doesn't drop required fields", () => {
    const input = toggleEnabledInput(svc);
    expect(input.config).toMatchObject({
      apiUrl: "http://127.0.0.1:5001",
      apiKey: "***",
    });
  });

  it("flips enabled at the top level and inside config", () => {
    const input = toggleEnabledInput(svc);
    expect(input.enabled).toBe(false);
    expect(input.config?.["enabled"]).toBe(false);
    expect(toggleEnabledInput({ ...svc, enabled: false }).enabled).toBe(true);
  });

  it("doesn't mutate the stored service", () => {
    toggleEnabledInput(svc);
    expect(svc.config.enabled).toBe(true);
  });
});
