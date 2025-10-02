import { describe, it, expect } from "vitest";
import { cn } from "./utils";

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
