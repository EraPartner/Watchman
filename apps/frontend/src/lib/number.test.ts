import { describe, expect, it } from "vitest";
import { isNonZero } from "./number";

describe("isNonZero", () => {
  it("matches number truthiness", () => {
    for (const n of [1, -1, 0.5, Infinity, 0, -0, NaN]) {
      expect(isNonZero(n)).toBe(Boolean(n));
    }
  });

  it("is false for null and undefined", () => {
    expect(isNonZero(null)).toBe(false);
    expect(isNonZero(undefined)).toBe(false);
  });
});
