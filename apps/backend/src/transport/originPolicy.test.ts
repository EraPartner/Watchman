import { describe, it, expect } from "vitest";
import { createOriginPolicy, parseOriginList } from "./originPolicy.js";

describe("parseOriginList", () => {
  it("returns empty for undefined or blank", () => {
    expect(parseOriginList(undefined)).toEqual([]);
    expect(parseOriginList("")).toEqual([]);
    expect(parseOriginList(" , ")).toEqual([]);
  });

  it("splits and trims comma-separated origins", () => {
    expect(parseOriginList("https://a.example, https://b.example")).toEqual([
      "https://a.example",
      "https://b.example",
    ]);
  });
});

describe("createOriginPolicy", () => {
  it("allows requests without an Origin header", () => {
    const policy = createOriginPolicy();
    expect(policy(undefined)).toBe(true);
    expect(policy("")).toBe(true);
  });

  it("allows desktop and loopback origins by default", () => {
    const policy = createOriginPolicy();
    expect(policy("watchman://frontend")).toBe(true);
    expect(policy("http://localhost:5173")).toBe(true);
    expect(policy("http://127.0.0.1:3001")).toBe(true);
  });

  it("rejects unknown origins by default", () => {
    const policy = createOriginPolicy();
    expect(policy("https://evil.example")).toBe(false);
    expect(policy("http://192.168.1.50:5173")).toBe(false);
  });

  it("allows configured extra origins, normalized to origin form", () => {
    const policy = createOriginPolicy(["https://watchman.example/some/path"]);
    expect(policy("https://watchman.example")).toBe(true);
    expect(policy("https://watchman.example:443")).toBe(true);
    expect(policy("https://other.example")).toBe(false);
  });

  it("rejects malformed origins", () => {
    const policy = createOriginPolicy(["https://watchman.example"]);
    expect(policy("not a url")).toBe(false);
  });
});
