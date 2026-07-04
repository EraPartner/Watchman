import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientEndpoints } from "./endpoints";
import type { ApiClientCore } from "./core";

// A minimal fake core that records the (endpoint, options) it was called with.
const requestMock = vi.fn();
const fakeCore = { request: requestMock } as unknown as ApiClientCore;

let endpoints: ApiClientEndpoints;

beforeEach(() => {
  requestMock.mockReset().mockResolvedValue({ ok: true });
  endpoints = new ApiClientEndpoints(fakeCore);
});

describe("ApiClientEndpoints", () => {
  it("getHealth hits /meta/health", async () => {
    await endpoints.getHealth();
    expect(requestMock).toHaveBeenCalledWith("/meta/health");
  });

  it("getVersion hits /meta/version", async () => {
    await endpoints.getVersion();
    expect(requestMock).toHaveBeenCalledWith("/meta/version");
  });

  it("getAggregatedServices hits /services", async () => {
    await endpoints.getAggregatedServices();
    expect(requestMock).toHaveBeenCalledWith("/services");
  });

  it("getServiceHealth encodes the kind and omits instance when absent", async () => {
    await endpoints.getServiceHealth("bit coin");
    expect(requestMock).toHaveBeenCalledWith("/services/bit%20coin/health");
  });

  it("getServiceHealth appends an encoded instance query when present", async () => {
    await endpoints.getServiceHealth("bitcoin", "node/1");
    expect(requestMock).toHaveBeenCalledWith(
      "/services/bitcoin/health?instance=node%2F1"
    );
  });

  it("getServiceStats builds the stats endpoint with instance", async () => {
    await endpoints.getServiceStats("adguard", "home");
    expect(requestMock).toHaveBeenCalledWith(
      "/services/adguard/stats?instance=home"
    );
  });

  it("controlService POSTs an action-only body", async () => {
    await endpoints.controlService("qbittorrent", "pause");
    const [url, opts] = requestMock.mock.calls[0];
    expect(url).toBe("/services/qbittorrent/control");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual({ action: "pause" });
  });

  it("controlService includes params and instance when provided", async () => {
    await endpoints.controlService("qbittorrent", "limit", { rate: 5 }, "seed");
    const [url, opts] = requestMock.mock.calls[0];
    expect(url).toBe("/services/qbittorrent/control?instance=seed");
    expect(JSON.parse(opts.body)).toEqual({
      action: "limit",
      params: { rate: 5 },
    });
    expect(opts.headers["Content-Type"]).toBe("application/json");
  });

  it("getInstances hits /instances", async () => {
    await endpoints.getInstances();
    expect(requestMock).toHaveBeenCalledWith("/instances");
  });

  it("getInstancesByKind encodes the kind", async () => {
    await endpoints.getInstancesByKind("mac mini");
    expect(requestMock).toHaveBeenCalledWith("/instances/mac%20mini");
  });

  it("getKinds hits /kinds", async () => {
    await endpoints.getKinds();
    expect(requestMock).toHaveBeenCalledWith("/kinds");
  });

  it("getSetupStatus hits /setup/status", async () => {
    await endpoints.getSetupStatus();
    expect(requestMock).toHaveBeenCalledWith("/setup/status");
  });
});
