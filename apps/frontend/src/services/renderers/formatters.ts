import type { MetricFormatter } from "./types";

const toNumber = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

export const fmtRaw: MetricFormatter = (v) => (v == null ? "—" : String(v));

export const fmtNumber =
  (precision = 0): MetricFormatter =>
  (v) => {
    const n = toNumber(v);
    if (n === undefined) return "—";
    return n.toLocaleString(undefined, {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
  };

export const fmtPercent =
  (precision = 1, scale: 1 | 100 = 100): MetricFormatter =>
  (v) => {
    const n = toNumber(v);
    if (n === undefined) return "—";
    const pct = scale === 100 ? n : n * 100;
    return `${pct.toFixed(precision)}%`;
  };

const UNITS_BINARY = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"];
export const fmtBytes: MetricFormatter = (v) => {
  const n = toNumber(v);
  if (n === undefined) return "—";
  let i = 0;
  let value = n;
  while (value >= 1024 && i < UNITS_BINARY.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 100 || i === 0 ? 0 : value >= 10 ? 1 : 2)} ${UNITS_BINARY[i]}`;
};

const UNITS_SI = ["", "K", "M", "G", "T", "P"];
export const fmtSi: MetricFormatter = (v) => {
  const n = toNumber(v);
  if (n === undefined) return "—";
  if (Math.abs(n) < 1000) return n.toString();
  let i = 0;
  let value = n;
  while (Math.abs(value) >= 1000 && i < UNITS_SI.length - 1) {
    value /= 1000;
    i += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)}${UNITS_SI[i]}`;
};

export const fmtUptime: MetricFormatter = (v) => {
  const n = toNumber(v);
  if (n === undefined) return "—";
  const s = Math.floor(n);
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3_600);
  const m = Math.floor((s % 3_600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

export const fmtTempC: MetricFormatter = (v) => {
  const n = toNumber(v);
  if (n === undefined) return "—";
  return `${n.toFixed(1)}°C`;
};

export const fmtBool =
  (on = "on", off = "off"): MetricFormatter =>
  (v) =>
    v === true ? on : v === false ? off : "—";

export const fmtVersion: MetricFormatter = (v) => {
  if (typeof v !== "string") return v == null ? "—" : String(v);
  const match = v.match(/\/Satoshi:([^/]+)\//);
  return match?.[1] ?? v;
};

/** Access nested dot-path on a plain object. Returns undefined on miss. */
export const dotGet = (obj: unknown, path: string): unknown => {
  if (obj == null || typeof obj !== "object") return undefined;
  const parts = path.split(".");
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur;
};
