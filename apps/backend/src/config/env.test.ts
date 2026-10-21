import { describe, it, expect } from "vitest";
import { loadEnv } from "./env.js";

describe("loadEnv", () => {
  it("applies defaults", () => {
    const env = loadEnv({});
    expect(env.BACKEND_V2_PORT).toBe(3001);
    expect(env.BACKEND_V2_HOST).toBe("0.0.0.0");
    expect(env.TRUST_PROXY).toBe(false);
  });

  it("parses TRUST_PROXY true/1 only", () => {
    expect(loadEnv({ TRUST_PROXY: "true" }).TRUST_PROXY).toBe(true);
    expect(loadEnv({ TRUST_PROXY: "1" }).TRUST_PROXY).toBe(true);
    expect(loadEnv({ TRUST_PROXY: "false" }).TRUST_PROXY).toBe(false);
  });

  // Regression: ports above 65535 passed validation and only failed later
  // in listen() instead of with the documented "Invalid environment" error.
  it("rejects out-of-range ports", () => {
    expect(() => loadEnv({ BACKEND_V2_PORT: "70000" })).toThrow(
      /Invalid environment[\s\S]*BACKEND_V2_PORT/
    );
    expect(() => loadEnv({ BACKEND_V2_PORT: "0" })).toThrow(
      /Invalid environment/
    );
    expect(loadEnv({ BACKEND_V2_PORT: "65535" }).BACKEND_V2_PORT).toBe(65535);
  });
});
