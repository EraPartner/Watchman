import { useMemo } from "react";
import { fmtRaw } from "@/services/renderers/formatters";
import type { ServiceRenderer } from "@/services/renderers/types";

const HIDDEN_KEYS = new Set([
  "activeTorrents",
  "recentErrors",
  "recentWarnings",
]);

function flatten(
  obj: Record<string, unknown> | undefined,
  prefix = ""
): Array<[string, unknown]> {
  if (!obj) return [];
  const out: Array<[string, unknown]> = [];
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (HIDDEN_KEYS.has(k)) continue;
    if (
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      Object.keys(v as object).length > 0
    ) {
      out.push(...flatten(v as Record<string, unknown>, path));
    } else {
      out.push([path, v]);
    }
  }
  return out;
}

function fmtAny(v: unknown): string {
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    return v
      .slice(0, 12)
      .map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x)))
      .join(", ");
  }
  if (typeof v === "object" && v !== null) return JSON.stringify(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  return fmtRaw(v);
}

export interface RawStatsPanelProps {
  renderer: ServiceRenderer | undefined;
  stats: Record<string, unknown> | undefined;
}

/** Renders any stats keys not surfaced in the renderer's detail groups —
 *  ensures every datapoint the backend returns reaches the user. */
export function RawStatsPanel({ renderer, stats }: RawStatsPanelProps) {
  const rows = useMemo(() => {
    const known = new Set<string>();
    if (renderer) {
      for (const group of renderer.detail) {
        for (const m of group.metrics) known.add(m.key);
      }
      for (const m of renderer.summary) known.add(m.key);
    }
    return flatten(stats).filter(([k]) => !known.has(k));
  }, [renderer, stats]);

  if (rows.length === 0) {
    return (
      <p className="text-fs-label text-[var(--text-lo)]">
        Every reported metric is already shown above.
      </p>
    );
  }

  return (
    <dl className="grid grid-cols-1 gap-x-s-4 gap-y-s-2 sm:grid-cols-2">
      {rows.map(([key, value]) => (
        <div
          key={key}
          className="min-w-0 border-b border-[var(--hairline)] pb-s-2 last:border-b-0"
        >
          <dt className="truncate font-mono text-fs-label text-[var(--text-lo)]">
            {key}
          </dt>
          <dd className="truncate font-mono tabular-nums text-fs-body text-[var(--text-hi)]">
            {fmtAny(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}
