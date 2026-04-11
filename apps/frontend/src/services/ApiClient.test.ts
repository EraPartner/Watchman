import { describe, expect, it } from "vitest";
import { ApiClient, apiClient } from "./ApiClient";

describe("ApiClient", () => {
  it("exports a singleton with endpoint methods", () => {
    expect(apiClient).toBeDefined();
    expect(typeof apiClient.getServicesHealth).toBe("function");
  });

  it("constructs a new ApiClient instance without throwing", () => {
    expect(() => new ApiClient()).not.toThrow();
  });

  it("inherits endpoint behavior from ApiClientEndpoints", () => {
    const instance = new ApiClient();
    expect(instance).toBeInstanceOf(ApiClient);
    expect(typeof instance.getBackendHealth).toBe("function");
  });
});
