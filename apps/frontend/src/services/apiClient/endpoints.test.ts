import { describe, expect, it, vi } from "vitest";
import { csrfManager } from "../../lib/csrf";
import { ApiClientEndpoints } from "./endpoints";

function createCoreStub() {
  return {
    request: vi.fn(),
    extractCompatibilityAuthToken: vi.fn(),
    setFallbackAuthToken: vi.fn(),
  };
}

describe("ApiClientEndpoints", () => {
  it("maps common status/stat endpoints to expected URLs", async () => {
    const core = createCoreStub();
    core.request.mockResolvedValue({});
    const endpoints = new ApiClientEndpoints(core as never);

    await endpoints.getAdGuardStatus();
    await endpoints.getAdGuardStats();
    await endpoints.getIpfsStatus();
    await endpoints.getIpfsStats();
    await endpoints.getQBittorrentStatus();
    await endpoints.getQBittorrentStats();
    await endpoints.getServicesHealth();
    await endpoints.getServiceInstances();
    await endpoints.getBackendHealth();
    await endpoints.getAuthMe();

    expect(core.request).toHaveBeenNthCalledWith(1, "/api/adguard/status");
    expect(core.request).toHaveBeenNthCalledWith(2, "/api/adguard/stats");
    expect(core.request).toHaveBeenNthCalledWith(3, "/api/ipfs/status");
    expect(core.request).toHaveBeenNthCalledWith(4, "/api/ipfs/stats");
    expect(core.request).toHaveBeenNthCalledWith(5, "/api/qbittorrent/status");
    expect(core.request).toHaveBeenNthCalledWith(6, "/api/qbittorrent/stats");
    expect(core.request).toHaveBeenNthCalledWith(7, "/api/services/health");
    expect(core.request).toHaveBeenNthCalledWith(8, "/api/services/instances");
    expect(core.request).toHaveBeenNthCalledWith(9, "/health");
    expect(core.request).toHaveBeenNthCalledWith(10, "/api/auth/me");
  });

  it("applies timeout on bitcoin endpoints", async () => {
    const core = createCoreStub();
    core.request.mockResolvedValue({});
    const endpoints = new ApiClientEndpoints(core as never);

    await endpoints.getBitcoinStatus();
    await endpoints.getBitcoinStats();

    expect(core.request.mock.calls[0][0]).toBe("/api/bitcoin/status");
    expect(core.request.mock.calls[0][1]).toBeUndefined();
    expect(typeof core.request.mock.calls[0][2]).toBe("number");

    expect(core.request.mock.calls[1][0]).toBe("/api/bitcoin/stats");
    expect(core.request.mock.calls[1][1]).toBeUndefined();
    expect(typeof core.request.mock.calls[1][2]).toBe("number");
  });

  it("uses server-information endpoint for deprecated homebridge aliases", async () => {
    const core = createCoreStub();
    core.request.mockResolvedValue({});
    const endpoints = new ApiClientEndpoints(core as never);

    await endpoints.getHomebridgeStatus();
    await endpoints.getHomebridgeStats();
    await endpoints.getStatusHomebridge();

    expect(core.request).toHaveBeenCalledTimes(3);
    expect(core.request).toHaveBeenNthCalledWith(
      1,
      "/api/status/server-information"
    );
    expect(core.request).toHaveBeenNthCalledWith(
      2,
      "/api/status/server-information"
    );
    expect(core.request).toHaveBeenNthCalledWith(
      3,
      "/api/status/server-information"
    );
  });

  it("login persists compatibility token and logout clears fallback token", async () => {
    const core = createCoreStub();
    const endpoints = new ApiClientEndpoints(core as never);

    const loginResponse = {
      user: { id: "1", username: "admin" },
      token: "legacy",
    };
    core.request.mockResolvedValueOnce(loginResponse);
    core.extractCompatibilityAuthToken.mockReturnValueOnce("legacy-token");

    await endpoints.login("admin", "secret", true);

    expect(core.request).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        username: "admin",
        password: "secret",
        remember: true,
      }),
      headers: { "Content-Type": "application/json" },
    });
    expect(core.extractCompatibilityAuthToken).toHaveBeenCalledWith(
      loginResponse
    );
    expect(core.setFallbackAuthToken).toHaveBeenCalledWith("legacy-token");

    core.request.mockResolvedValueOnce({ success: true });
    await endpoints.logout();

    expect(core.setFallbackAuthToken).toHaveBeenCalledWith(null);
    expect(core.request).toHaveBeenLastCalledWith("/api/auth/logout", {
      method: "POST",
    });
  });

  it("getFrontendConfig configures csrfManager from backend config", async () => {
    const core = createCoreStub();
    const endpoints = new ApiClientEndpoints(core as never);
    const configureSpy = vi.spyOn(csrfManager, "configure");

    core.request.mockResolvedValueOnce({
      security: {
        csrf: {
          cookieName: "customCsrfCookie",
          headerName: "x-custom-csrf",
        },
      },
    });

    await endpoints.getFrontendConfig();

    expect(core.request).toHaveBeenCalledWith("/api/config/frontend");
    expect(configureSpy).toHaveBeenCalledWith({
      cookieName: "customCsrfCookie",
      headerName: "x-custom-csrf",
    });
  });

  it("sets fallback auth token to null when compatibility token is missing", async () => {
    const core = createCoreStub();
    const endpoints = new ApiClientEndpoints(core as never);

    core.request.mockResolvedValueOnce({
      user: { id: "1", username: "admin" },
    });
    core.extractCompatibilityAuthToken.mockReturnValueOnce(undefined);

    await endpoints.login("admin", "secret");

    expect(core.setFallbackAuthToken).toHaveBeenCalledWith(null);
  });

  it("composes endpoint URLs for getRouterArp and getTorRelay(nickname)", async () => {
    const core = createCoreStub();
    core.request.mockResolvedValue({});
    const endpoints = new ApiClientEndpoints(core as never);

    await endpoints.getRouterArp("My Service/Node");
    expect(core.request).toHaveBeenCalledWith(
      "/api/router/arp?service=My%20Service%2FNode"
    );

    await endpoints.getTorRelay("relay-abc");
    expect(core.request).toHaveBeenCalledWith("/api/tor/relay/relay-abc");
  });

  it("uses expected payloads for write operations and service key endpoints", async () => {
    const core = createCoreStub();
    core.request.mockResolvedValue({});
    const endpoints = new ApiClientEndpoints(core as never);

    await endpoints.setAdGuardProtection(true, 3600);
    expect(core.request).toHaveBeenNthCalledWith(1, "/api/adguard/protection", {
      method: "POST",
      body: JSON.stringify({ enabled: true, duration: 3600 }),
      headers: { "Content-Type": "application/json" },
    });

    await endpoints.clearBackendCache();
    expect(core.request).toHaveBeenNthCalledWith(2, "/api/cache/clear", {
      method: "POST",
      body: JSON.stringify({ type: "all" }),
      headers: { "Content-Type": "application/json" },
    });

    await endpoints.getServiceUpdates("adguard");
    expect(core.request).toHaveBeenNthCalledWith(3, "/api/adguard/updates");

    await endpoints.getServiceHealth("bitcoin");
    expect(core.request).toHaveBeenNthCalledWith(4, "/api/bitcoin/status");

    await endpoints.getServiceStats("bitcoin");
    expect(core.request).toHaveBeenNthCalledWith(5, "/api/bitcoin/stats");
  });
});
