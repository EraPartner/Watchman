import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildHref,
  formatDisplayUrl,
  formatPingDisplay,
  openHref,
} from "./url";

describe("url helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("formats display urls and handles missing values", () => {
    expect(formatDisplayUrl(undefined)).toBe("N/A");
    expect(formatDisplayUrl(null)).toBe("N/A");
    expect(formatDisplayUrl("https://example.com/")).toBe("example.com");
    expect(formatDisplayUrl("http://example.com/path")).toBe(
      "example.com/path"
    );
    expect(formatDisplayUrl("wss://socket.example.com/")).toBe(
      "socket.example.com"
    );
  });

  it("builds href using existing scheme or preferred scheme", () => {
    expect(buildHref(undefined)).toBeNull();
    expect(buildHref(null)).toBeNull();
    expect(buildHref("")).toBeNull();
    expect(buildHref("https://example.com")).toBe("https://example.com");
    expect(buildHref("ftp://example.com")).toBe("ftp://example.com");
    expect(buildHref("example.com")).toBe("http://example.com");
    expect(buildHref("example.com", true)).toBe("https://example.com");
  });

  it("formats ping display states", () => {
    expect(formatPingDisplay(true)).toBe("ICMP: Responding");
    expect(formatPingDisplay(false)).toBe("ICMP: No response");
    expect(formatPingDisplay(null)).toBe("ICMP: N/A");
    expect(formatPingDisplay(undefined)).toBe("ICMP: N/A");
  });

  it("opens href when provided and no-ops otherwise", () => {
    const openSpy = vi.fn();
    vi.stubGlobal("window", { open: openSpy });

    openHref(undefined);
    openHref(null);
    openHref("");
    expect(openSpy).not.toHaveBeenCalled();

    openHref("https://example.com");
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(openSpy).toHaveBeenCalledWith("https://example.com", "_blank");
  });

  it("swallows window.open errors", () => {
    vi.stubGlobal("window", {
      open: () => {
        throw new Error("blocked");
      },
    });

    expect(() => openHref("https://example.com")).not.toThrow();
  });
});
