import { describe, expect, it } from "vitest";
import {
  KIND_CATEGORIES,
  CATEGORY_ORDER,
  getKindMeta,
} from "./kindCategories";

describe("KIND_CATEGORIES", () => {
  it("defines all expected service kinds", () => {
    const expected = [
      "router", "adguard", "tor", "qbittorrent", "roon",
      "bitcoin", "albyHub", "ipfs", "philipsBridge", "homebridge",
      "macMini", "synology", "raspberryPi",
    ];
    for (const kind of expected) {
      expect(KIND_CATEGORIES[kind], `${kind} missing`).toBeDefined();
    }
  });

  it("every entry has a category, icon, and blurb", () => {
    for (const [kind, meta] of Object.entries(KIND_CATEGORIES)) {
      expect(meta.category, `${kind}.category`).toBeTruthy();
      expect(meta.icon, `${kind}.icon`).toBeTruthy();
      expect(meta.blurb, `${kind}.blurb`).toBeTruthy();
    }
  });

  it("all categories are in CATEGORY_ORDER", () => {
    const validCategories = new Set(CATEGORY_ORDER);
    for (const [kind, meta] of Object.entries(KIND_CATEGORIES)) {
      expect(validCategories.has(meta.category), `${kind}.category=${meta.category}`).toBe(true);
    }
  });
});

describe("CATEGORY_ORDER", () => {
  it("contains all five expected categories in order", () => {
    expect(CATEGORY_ORDER).toEqual(["Network", "Media", "Bitcoin", "Home", "Hardware"]);
  });
});

describe("getKindMeta", () => {
  it("returns known kind metadata", () => {
    const meta = getKindMeta("router");
    expect(meta.category).toBe("Network");
    expect(meta.blurb).toBeTruthy();
  });

  it("returns fallback for unknown kind", () => {
    const meta = getKindMeta("unknown-service-xyz");
    expect(meta).toBeDefined();
    expect(meta.category).toBeTruthy();
    expect(meta.icon).toBeTruthy();
  });

  it("fallback has empty blurb", () => {
    const meta = getKindMeta("not-a-real-kind");
    expect(meta.blurb).toBe("");
  });
});
