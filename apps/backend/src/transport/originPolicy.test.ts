import { describe, it, expect } from "vitest";
import {
  createOriginPolicy,
  createHostPolicy,
  parseOriginList,
} from "./originPolicy.js";

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

describe("createHostPolicy (DNS-rebinding guard)", () => {
  it("allows loopback names and IP literals (with or without port)", () => {
    const policy = createHostPolicy();
    expect(policy("localhost:3001")).toBe(true);
    expect(policy("127.0.0.1:3001")).toBe(true);
    expect(policy("[::1]:3001")).toBe(true);
    expect(policy("192.168.1.50:3001")).toBe(true); // LAN IP access
    expect(policy(undefined)).toBe(true); // non-browser client
  });

  it("rejects an unknown DNS name (the rebinding vector)", () => {
    const policy = createHostPolicy();
    expect(policy("attacker.com")).toBe(false);
    expect(policy("attacker.com:3001")).toBe(false);
  });

  it("allows this host's own name and its .local form", () => {
    const policy = createHostPolicy([], "macmini");
    expect(policy("macmini:3001")).toBe(true);
    expect(policy("macmini.local:3001")).toBe(true);
    expect(policy("MacMini")).toBe(true); // case-insensitive
    expect(policy("other-host")).toBe(false);
  });

  it("allows hosts of configured CORS origins", () => {
    const policy = createHostPolicy(["https://watchman.example:8443"]);
    expect(policy("watchman.example:8443")).toBe(true);
    expect(policy("watchman.example")).toBe(true); // any port on the allowed name
    expect(policy("evil.example")).toBe(false);
  });
});
