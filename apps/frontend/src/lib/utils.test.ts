import { describe, expect, it } from "vitest";
import {
  cn,
  formatBytes,
  formatNumber,
  formatSpeed,
  formatUptime,
  instanceDisplayName,
} from "./utils";

describe("cn utility", () => {
  it("joins class names and merges Tailwind classes", () => {
    const result = cn("p-2", "p-4", "text-center", {
      "font-bold": true,
    } as any);
    // tailwind-merge should prefer the last p-* class, so expect p-4
    expect(result).toContain("p-4");
    expect(result).toContain("text-center");
    expect(result).toContain("font-bold");
  });

  it("handles falsy and duplicate values", () => {
    const result = cn("p-2", false as any, undefined as any, "p-2");
    expect(result).toContain("p-2");
    // Should not include 'false' or 'undefined' strings
    expect(result).not.toContain("false");
    expect(result).not.toContain("undefined");
  });
});

describe("formatNumber", () => {
  it("formats millions with M suffix", () => {
    expect(formatNumber(1500000)).toBe("1.5M");
  });

  it("formats thousands with K suffix", () => {
    expect(formatNumber(1200)).toBe("1.2K");
  });

  it("returns localized string for values below one thousand", () => {
    expect(formatNumber(999)).toBe("999");
  });
});

describe("formatBytes", () => {
  it("returns N/A for nullish values", () => {
    expect(formatBytes(null)).toBe("N/A");
    expect(formatBytes(undefined)).toBe("N/A");
  });

  it("returns 0 B for non-finite numbers and zero", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(Number.POSITIVE_INFINITY)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });

  it("formats values into larger units with configurable decimals", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1536, 2)).toBe("1.5 KB");
    expect(formatBytes(1048576)).toBe("1 MB");
  });
});

describe("formatUptime", () => {
  it("formats uptime with days and hours when days are present", () => {
    expect(formatUptime(90061)).toBe("1d 1h");
  });

  it("formats uptime with hours and minutes when under one day", () => {
    expect(formatUptime(7260)).toBe("2h 1m");
  });

  it("formats uptime in minutes when under one hour", () => {
    expect(formatUptime(180)).toBe("3m");
  });
});

describe("formatSpeed", () => {
  it("formats byte rate with /s suffix", () => {
    expect(formatSpeed(1024)).toBe("1 KB/s");
  });

  it("preserves formatBytes behavior for nullish values", () => {
    expect(formatSpeed(null)).toBe("N/A/s");
  });
});

describe("instanceDisplayName", () => {
  it("returns service name with instance suffix when instance number is provided", () => {
    expect(instanceDisplayName("qBittorrent", 2)).toBe("qBittorrent #2");
  });

  it("returns service name as-is when instance number is absent or zero", () => {
    expect(instanceDisplayName("qBittorrent")).toBe("qBittorrent");
    expect(instanceDisplayName("qBittorrent", 0)).toBe("qBittorrent");
  });
});
