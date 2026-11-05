import { describe, expect, it } from "vitest";
import { toText } from "./text.js";

describe("toText", () => {
  it("passes strings through and stringifies primitives", () => {
    expect(toText("abc")).toBe("abc");
    expect(toText(42)).toBe("42");
    expect(toText(false)).toBe("false");
    expect(toText(10n)).toBe("10");
  });

  it("maps null and undefined to the empty value", () => {
    expect(toText(null)).toBe("");
    expect(toText(undefined, "-")).toBe("-");
  });

  it("serializes objects instead of printing [object Object]", () => {
    expect(toText({ a: 1 })).toBe('{"a":1}');
    expect(toText(new Error("boom"))).toBe("boom");
  });

  it("falls back when an object cannot be serialized", () => {
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(toText(cyclic)).toBe("[object Object]");
  });
});
