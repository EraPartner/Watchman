import { describe, expect, it } from "vitest";
import { toText } from "./text";

describe("toText", () => {
  it("keeps primitives readable", () => {
    expect(toText("a")).toBe("a");
    expect(toText(0)).toBe("0");
    expect(toText(false)).toBe("false");
    expect(toText(10n)).toBe("10");
  });

  it("uses the empty marker for null and undefined", () => {
    expect(toText(null)).toBe("—");
    expect(toText(undefined, "")).toBe("");
  });

  it("renders objects as JSON instead of [object Object]", () => {
    expect(toText({ a: 1 })).toBe('{"a":1}');
    expect(toText(["x"])).toBe('["x"]');
  });

  it("falls back for values JSON cannot encode", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic["self"] = cyclic;
    expect(toText(cyclic)).toBe("[object Object]");
  });
});
