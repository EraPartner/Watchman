import { beforeEach, describe, expect, it, vi } from "vitest";

const requestMock = vi.fn();

vi.mock("./ApiClient", () => ({
  sharedCore: {
    request: (...args: unknown[]) => requestMock(...args),
  },
}));

import { configApi } from "./configApi";

describe("configApi", () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it("getSetupStatus calls /setup/status", async () => {
    requestMock.mockResolvedValue({ needsSetup: false, serviceCount: 3 });
    const result = await configApi.getSetupStatus();
    expect(requestMock).toHaveBeenCalledWith("/setup/status");
    expect(result.needsSetup).toBe(false);
  });

  it("getKinds calls /config/kinds", async () => {
    requestMock.mockResolvedValue([]);
    await configApi.getKinds();
    expect(requestMock).toHaveBeenCalledWith("/config/kinds");
  });

  it("listServices calls /config/services", async () => {
    requestMock.mockResolvedValue([]);
    await configApi.listServices();
    expect(requestMock).toHaveBeenCalledWith("/config/services");
  });

  it("getService calls /config/services/:id", async () => {
    requestMock.mockResolvedValue({});
    await configApi.getService("bitcoin:main");
    expect(requestMock).toHaveBeenCalledWith("/config/services/bitcoin%3Amain");
  });

  it("createService sends POST with merged config", async () => {
    requestMock.mockResolvedValue({});
    await configApi.createService({
      kind: "bitcoin",
      instanceId: "main",
      enabled: true,
      config: { host: "10.0.0.1" },
    });
    const [url, opts] = requestMock.mock.calls[0];
    expect(url).toBe("/config/services");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.kind).toBe("bitcoin");
    expect(body.host).toBe("10.0.0.1");
  });

  it("createService without config still sends valid body", async () => {
    requestMock.mockResolvedValue({});
    await configApi.createService({ kind: "tor", instanceId: "main", enabled: true });
    const [, opts] = requestMock.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.kind).toBe("tor");
  });

  it("updateService sends PUT to /config/services/:id", async () => {
    requestMock.mockResolvedValue({});
    await configApi.updateService("tor:main", { enabled: false });
    const [url, opts] = requestMock.mock.calls[0];
    expect(url).toBe("/config/services/tor%3Amain");
    expect(opts.method).toBe("PUT");
  });

  it("deleteService sends DELETE to /config/services/:id", async () => {
    requestMock.mockResolvedValue(undefined);
    await configApi.deleteService("bitcoin:main");
    const [url, opts] = requestMock.mock.calls[0];
    expect(url).toBe("/config/services/bitcoin%3Amain");
    expect(opts.method).toBe("DELETE");
  });

  it("testService sends POST to /config/services/:id/test", async () => {
    requestMock.mockResolvedValue({ ok: true, latencyMs: 42 });
    const result = await configApi.testService("synology:main");
    const [url] = requestMock.mock.calls[0];
    expect(url).toBe("/config/services/synology%3Amain/test");
    expect(result.ok).toBe(true);
  });

  it("listAudit calls /config/audit?limit=N", async () => {
    requestMock.mockResolvedValue([]);
    await configApi.listAudit(50);
    expect(requestMock).toHaveBeenCalledWith("/config/audit?limit=50");
  });

  it("listAudit uses default limit of 100", async () => {
    requestMock.mockResolvedValue([]);
    await configApi.listAudit();
    expect(requestMock).toHaveBeenCalledWith("/config/audit?limit=100");
  });

  it("exportConfig calls /config/export", async () => {
    const bundle = { version: 1 as const, exportedAt: "2024-01-01", payload: "..." };
    requestMock.mockResolvedValue(bundle);
    const result = await configApi.exportConfig();
    expect(requestMock).toHaveBeenCalledWith("/config/export");
    expect(result.version).toBe(1);
  });

  it("importConfig sends POST to /config/import with bundle", async () => {
    const importResult = { imported: 2, updated: 0, skipped: 0, errors: [] };
    requestMock.mockResolvedValue(importResult);
    const bundle = { version: 1 as const, exportedAt: "2024-01-01", payload: "data" };
    await configApi.importConfig(bundle);
    const [url, opts] = requestMock.mock.calls[0];
    expect(url).toBe("/config/import");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.version).toBe(1);
  });
});
