import { beforeEach, describe, expect, it, vi } from "vitest";

// profilesApi delegates every call to the shared request pipeline; mock it so we
// can assert the URL + request options each method builds.
const requestMock = vi.fn();
vi.mock("./ApiClient", () => ({
  sharedCore: { request: (...args: unknown[]) => requestMock(...args) },
}));

import { profilesApi } from "./profilesApi";
import type { ProfileInput } from "./profilesApi";

beforeEach(() => {
  requestMock.mockReset().mockResolvedValue({});
});

describe("profilesApi", () => {
  it("list GETs /profiles", async () => {
    await profilesApi.list();
    expect(requestMock).toHaveBeenCalledWith("/profiles");
  });

  it("get encodes the id", async () => {
    await profilesApi.get("a b");
    expect(requestMock).toHaveBeenCalledWith("/profiles/a%20b");
  });

  it("create POSTs a JSON body", async () => {
    const input: ProfileInput = { name: "Home" };
    await profilesApi.create(input);
    const [url, opts] = requestMock.mock.calls[0];
    expect(url).toBe("/profiles");
    expect(opts.method).toBe("POST");
    expect(JSON.parse(opts.body)).toEqual(input);
    expect(opts.headers["Content-Type"]).toBe("application/json");
  });

  it("update PUTs a JSON patch to the encoded id", async () => {
    await profilesApi.update("id/1", { color: "#fff" });
    const [url, opts] = requestMock.mock.calls[0];
    expect(url).toBe("/profiles/id%2F1");
    expect(opts.method).toBe("PUT");
    expect(JSON.parse(opts.body)).toEqual({ color: "#fff" });
  });

  it("remove DELETEs the encoded id", async () => {
    await profilesApi.remove("x");
    const [url, opts] = requestMock.mock.calls[0];
    expect(url).toBe("/profiles/x");
    expect(opts.method).toBe("DELETE");
  });

  it("getActive GETs /profiles/active", async () => {
    await profilesApi.getActive();
    expect(requestMock).toHaveBeenCalledWith("/profiles/active");
  });

  it("setActive PUTs the profileId", async () => {
    await profilesApi.setActive("p1");
    const [url, opts] = requestMock.mock.calls[0];
    expect(url).toBe("/profiles/active");
    expect(opts.method).toBe("PUT");
    expect(JSON.parse(opts.body)).toEqual({ profileId: "p1" });
  });

  it("setAutoSwitch PUTs the flag to /profiles/settings", async () => {
    await profilesApi.setAutoSwitch(true);
    const [url, opts] = requestMock.mock.calls[0];
    expect(url).toBe("/profiles/settings");
    expect(JSON.parse(opts.body)).toEqual({ autoSwitch: true });
  });

  it("getCurrentNetwork GETs /profiles/current-network", async () => {
    await profilesApi.getCurrentNetwork();
    expect(requestMock).toHaveBeenCalledWith("/profiles/current-network");
  });

  it("captureNetwork POSTs to the capture endpoint of the encoded id", async () => {
    await profilesApi.captureNetwork("z 9");
    const [url, opts] = requestMock.mock.calls[0];
    expect(url).toBe("/profiles/z%209/capture-network");
    expect(opts.method).toBe("POST");
    expect(opts.body).toBe("{}");
  });
});
