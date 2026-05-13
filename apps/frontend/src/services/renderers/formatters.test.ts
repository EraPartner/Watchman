import { describe, expect, it } from "vitest";
import {
  fmtRaw,
  fmtNumber,
  fmtPercent,
  fmtBytes,
  fmtSi,
  fmtUptime,
  fmtTempC,
  fmtBool,
  fmtVolt,
  fmtVersion,
  dotGet,
} from "./formatters";

describe("fmtRaw", () => {
  it("returns '—' for null", () => expect(fmtRaw(null)).toBe("—"));
  it("returns '—' for undefined", () => expect(fmtRaw(undefined)).toBe("—"));
  it("stringifies numbers", () => expect(fmtRaw(42)).toBe("42"));
  it("stringifies booleans", () => expect(fmtRaw(true)).toBe("true"));
  it("returns strings as-is", () => expect(fmtRaw("hello")).toBe("hello"));
});

describe("fmtNumber", () => {
  it("returns '—' for non-numeric values", () => {
    expect(fmtNumber(0)(null)).toBe("—");
    expect(fmtNumber(0)(undefined)).toBe("—");
    expect(fmtNumber(0)("abc")).toBe("—");
  });

  it("formats integer with 0 decimal places", () => {
    const result = fmtNumber(0)(1234567);
    expect(result).toContain("1");
    expect(result).not.toContain(".");
  });

  it("formats with specified precision", () => {
    const result = fmtNumber(2)(3.14159);
    expect(result).toContain("3.14");
  });

  it("coerces numeric strings", () => {
    expect(fmtNumber(0)("42")).toBe(
      (42).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    );
  });
});

describe("fmtPercent", () => {
  it("returns '—' for non-numeric input", () => {
    expect(fmtPercent()(null)).toBe("—");
    expect(fmtPercent()("abc")).toBe("—");
  });

  it("scales by 100 when scale=100 (raw fraction)", () => {
    // fmtPercent default: precision=1, scale=100 (value IS already a %)
    expect(fmtPercent(1, 100)(75)).toBe("75.0%");
  });

  it("multiplies by 100 when scale=1 (raw 0-1 fraction)", () => {
    expect(fmtPercent(1, 1)(0.75)).toBe("75.0%");
  });
});

describe("fmtBytes", () => {
  it("returns '—' for non-numeric input", () => {
    expect(fmtBytes(null)).toBe("—");
    expect(fmtBytes(undefined)).toBe("—");
  });

  it("formats bytes with B unit for small values", () => {
    expect(fmtBytes(512)).toContain("B");
    expect(fmtBytes(512)).not.toContain("KiB");
  });

  it("formats KiB for values 1024+", () => {
    const result = fmtBytes(2048);
    expect(result).toContain("KiB");
  });

  it("formats MiB for megabytes", () => {
    const result = fmtBytes(1024 * 1024 * 5);
    expect(result).toContain("MiB");
  });

  it("formats GiB for gigabytes", () => {
    const result = fmtBytes(1024 * 1024 * 1024 * 2);
    expect(result).toContain("GiB");
  });

  it("formats 0 bytes as '0 B'", () => {
    expect(fmtBytes(0)).toBe("0 B");
  });
});

describe("fmtSi", () => {
  it("returns '—' for non-numeric", () => {
    expect(fmtSi(null)).toBe("—");
  });

  it("returns small numbers unchanged", () => {
    expect(fmtSi(42)).toBe("42");
    expect(fmtSi(999)).toBe("999");
  });

  it("formats thousands as K", () => {
    const result = fmtSi(5000);
    expect(result).toContain("K");
  });

  it("formats millions as M", () => {
    const result = fmtSi(2_000_000);
    expect(result).toContain("M");
  });
});

describe("fmtUptime", () => {
  it("returns '—' for non-numeric", () => {
    expect(fmtUptime(null)).toBe("—");
  });

  it("formats minutes for short uptimes", () => {
    expect(fmtUptime(300)).toBe("5m");
  });

  it("formats hours and minutes", () => {
    const result = fmtUptime(3700);
    expect(result).toMatch(/1h \d+m/);
  });

  it("formats days and hours for long uptimes", () => {
    const result = fmtUptime(86_400 * 3 + 7200);
    expect(result).toMatch(/3d \d+h/);
  });
});

describe("fmtTempC", () => {
  it("returns '—' for non-numeric", () => {
    expect(fmtTempC(null)).toBe("—");
  });

  it("formats temperature with 1 decimal", () => {
    expect(fmtTempC(65.5)).toBe("65.5°C");
    expect(fmtTempC(72)).toBe("72.0°C");
  });
});

describe("fmtBool", () => {
  it("returns custom 'on' string for true", () => {
    expect(fmtBool("yes", "no")(true)).toBe("yes");
  });

  it("returns custom 'off' string for false", () => {
    expect(fmtBool("yes", "no")(false)).toBe("no");
  });

  it("uses defaults when not specified", () => {
    expect(fmtBool()(true)).toBe("on");
    expect(fmtBool()(false)).toBe("off");
  });

  it("returns '—' for non-boolean values", () => {
    expect(fmtBool()(null)).toBe("—");
    expect(fmtBool()(42)).toBe("—");
  });
});

describe("fmtVolt", () => {
  it("returns '—' for non-numeric", () => {
    expect(fmtVolt(null)).toBe("—");
  });

  it("formats voltage with 4 decimal places", () => {
    expect(fmtVolt(1.2)).toBe("1.2000V");
    expect(fmtVolt(3.3)).toBe("3.3000V");
  });
});

describe("fmtVersion", () => {
  it("returns '—' for null/undefined", () => {
    expect(fmtVersion(null)).toBe("—");
    expect(fmtVersion(undefined)).toBe("—");
  });

  it("extracts Satoshi version from Bitcoin user agent", () => {
    expect(fmtVersion("/Satoshi:25.0.0/")).toBe("25.0.0");
  });

  it("returns string as-is when no Satoshi pattern", () => {
    expect(fmtVersion("1.2.3")).toBe("1.2.3");
  });

  it("stringifies non-string non-null values", () => {
    expect(fmtVersion(42)).toBe("42");
  });
});

describe("dotGet", () => {
  it("returns undefined for null/non-object", () => {
    expect(dotGet(null, "a")).toBeUndefined();
    expect(dotGet(42, "a")).toBeUndefined();
  });

  it("returns top-level property", () => {
    expect(dotGet({ a: 1 }, "a")).toBe(1);
  });

  it("returns nested property via dot path", () => {
    expect(dotGet({ a: { b: { c: 99 } } }, "a.b.c")).toBe(99);
  });

  it("returns undefined for missing path segments", () => {
    expect(dotGet({ a: 1 }, "a.b")).toBeUndefined();
    expect(dotGet({}, "x.y.z")).toBeUndefined();
  });

  it("returns undefined when intermediate is null", () => {
    expect(dotGet({ a: null }, "a.b")).toBeUndefined();
  });
});
