import { describe, expect, it } from "vitest";
import { buildQuickLink } from "./quickLink";

describe("buildQuickLink", () => {
  it("returns undefined when no host-like field is configured", () => {
    expect(buildQuickLink({ config: {} })).toBeUndefined();
    expect(buildQuickLink({ config: undefined })).toBeUndefined();
  });

  it("preserves a fully-qualified URL", () => {
    expect(
      buildQuickLink(
        { config: { url: "https://nas.example:5001" } },
        { hostKeys: ["url"] }
      )
    ).toBe("https://nas.example:5001");
  });

  it("appends scheme to bare host:port", () => {
    expect(
      buildQuickLink(
        { config: { host: "192.168.1.10:8080" } },
        { hostKeys: ["host"] }
      )
    ).toBe("http://192.168.1.10:8080");
  });

  it("falls back to default port when none is in the host string", () => {
    expect(
      buildQuickLink(
        { config: { host: "192.168.1.10" } },
        { hostKeys: ["host"], defaultPort: 8080 }
      )
    ).toBe("http://192.168.1.10:8080");
  });

  it("uses an explicit port from config when provided", () => {
    expect(
      buildQuickLink(
        { config: { host: "router.local", uiPort: 9000 } },
        { hostKeys: ["host"], portKeys: ["uiPort"] }
      )
    ).toBe("http://router.local:9000");
  });

  it("upgrades scheme when forced", () => {
    expect(
      buildQuickLink(
        { config: { host: "bridge.local" } },
        { hostKeys: ["host"], scheme: "https" }
      )
    ).toBe("https://bridge.local");
  });

  it("appends a path when configured", () => {
    expect(
      buildQuickLink(
        { config: { host: "ipfs.local", apiPort: 5001 } },
        { hostKeys: ["host"], portKeys: ["apiPort"], path: "/webui" }
      )
    ).toBe("http://ipfs.local:5001/webui");
  });

  it("ignores empty strings", () => {
    expect(
      buildQuickLink(
        { config: { host: "" } },
        { hostKeys: ["host"], defaultPort: 80 }
      )
    ).toBeUndefined();
  });
});
