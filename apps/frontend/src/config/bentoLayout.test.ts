import { describe, expect, it } from "vitest";
import { BENTO_LAYOUT } from "./bentoLayout";

describe("BENTO_LAYOUT", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(BENTO_LAYOUT)).toBe(true);
    expect(BENTO_LAYOUT.length).toBeGreaterThan(0);
  });

  it("every entry has a kind string and a valid size", () => {
    const validSizes = new Set(["XL", "L", "M", "S"]);
    for (const entry of BENTO_LAYOUT) {
      expect(typeof entry.kind).toBe("string");
      expect(entry.kind.length).toBeGreaterThan(0);
      expect(validSizes.has(entry.size)).toBe(true);
    }
  });

  it("includes bitcoin as XL", () => {
    const bitcoin = BENTO_LAYOUT.find((e) => e.kind === "bitcoin");
    expect(bitcoin?.size).toBe("XL");
  });

  it("has unique kinds", () => {
    const kinds = BENTO_LAYOUT.map((e) => e.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});
