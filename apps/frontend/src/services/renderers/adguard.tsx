import type { ReactNode } from "react";
import type { ServiceRenderer } from "./types";
import { buildQuickLink } from "./quickLink";
import { dotGet, fmtNumber, fmtPercent, fmtRaw } from "./formatters";

type Stats = Record<string, unknown>;

interface TopRow {
  label: string;
  value: string;
}

function safeStr(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  if (!v || v === "N/A") return undefined;
  return v;
}

function renderAdGuardPanel(stats: Stats | undefined): ReactNode {
  if (!stats) {
    return (
      <p className="text-fs-label text-[var(--text-lo)]">
        No diagnostics yet.
      </p>
    );
  }

  const tops: TopRow[] = [];
  const top = (label: string, key: string) => {
    const v = safeStr(stats[key]);
    if (v) tops.push({ label, value: v });
  };
  top("Top blocked", "topBlockedDomain");
  top("Top queried", "topQueriedDomain");
  top("Top client", "topClient");

  const featurePairs: Array<[string, unknown]> = [
    ["Filtering", stats.filteringEnabled],
    ["Safe browsing", stats.safebrowsingEnabled],
    ["Safe search", stats.safesearchEnabled],
    ["Parental", stats.parentalEnabled],
    ["DHCP", stats.dhcpEnabled],
  ];
  const features = featurePairs
    .map(([label, raw]) => {
      const tone =
        raw === true ? "var(--ok)" : raw === false ? "var(--text-lo)" : "var(--warn)";
      const text = raw === true ? "on" : raw === false ? "off" : "—";
      return { label, tone, text };
    });

  const upstream = {
    count:
      typeof stats.upstreamCount === "number" ? stats.upstreamCount : undefined,
    mode: safeStr(stats.upstreamMode),
  };

  const filters = {
    rules: typeof stats.totalRules === "number" ? stats.totalRules : undefined,
    lists:
      typeof stats.filterCount === "number" ? stats.filterCount : undefined,
    custom: typeof stats.userRules === "number" ? stats.userRules : undefined,
  };

  return (
    <div className="space-y-s-6">
      {tops.length > 0 ? (
        <section className="space-y-s-2">
          <h3 className="text-fs-label font-[600] uppercase tracking-[0.06em] text-[var(--text-lo)]">
            Top of recent queries
          </h3>
          <dl className="grid grid-cols-1 gap-y-s-2">
            {tops.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-s-3 border-b border-[var(--hairline)] pb-s-2 last:border-b-0"
              >
                <dt className="text-fs-label text-[var(--text-lo)]">
                  {row.label}
                </dt>
                <dd className="truncate font-mono tabular-nums text-fs-body text-[var(--text-hi)]">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      <section className="space-y-s-2">
        <h3 className="text-fs-label font-[600] uppercase tracking-[0.06em] text-[var(--text-lo)]">
          Protection features
        </h3>
        <ul className="grid grid-cols-2 gap-x-s-4 gap-y-s-2">
          {features.map((f) => (
            <li
              key={f.label}
              className="flex items-baseline justify-between gap-s-2 text-fs-label"
            >
              <span className="text-[var(--text-lo)]">{f.label}</span>
              <span
                className="font-mono uppercase tracking-[0.06em]"
                style={{ color: f.tone }}
              >
                {f.text}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-s-2">
        <h3 className="text-fs-label font-[600] uppercase tracking-[0.06em] text-[var(--text-lo)]">
          Filters &amp; upstreams
        </h3>
        <dl className="grid grid-cols-2 gap-x-s-4 gap-y-s-2 text-fs-label">
          <div>
            <dt className="text-[var(--text-lo)]">Lists</dt>
            <dd className="font-mono tabular-nums text-[var(--text-hi)]">
              {filters.lists ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-lo)]">Rules</dt>
            <dd className="font-mono tabular-nums text-[var(--text-hi)]">
              {filters.rules?.toLocaleString() ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-lo)]">Custom rules</dt>
            <dd className="font-mono tabular-nums text-[var(--text-hi)]">
              {filters.custom?.toLocaleString() ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--text-lo)]">Upstream mode</dt>
            <dd className="font-mono tabular-nums text-[var(--text-hi)]">
              {upstream.mode ?? "—"}{" "}
              {upstream.count !== undefined ? `(${upstream.count})` : ""}
            </dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

export const adguardRenderer: ServiceRenderer<Stats> = {
  kind: "adguard",
  displayName: "AdGuard Home",
  quickLink: (ctx) =>
    buildQuickLink(ctx, {
      hostKeys: ["url", "host"],
      portKeys: ["uiPort", "port", "httpPort"],
      defaultPort: 80,
    }),
  quickLinkLabel: "Open AdGuard UI",

  summary: [
    { key: "blockingRate", label: "Blocked", format: fmtPercent(1, 100) },
    { key: "totalQueries", label: "Queries", format: fmtNumber(0) },
    { key: "blockedQueries", label: "Blocks", format: fmtNumber(0) },
  ],

  detail: [
    {
      title: "Status",
      metrics: [
        { key: "running", label: "Running", format: fmtRaw },
        { key: "protectionEnabled", label: "Protection", format: fmtRaw },
        { key: "version", label: "Version", format: fmtRaw },
      ],
    },
    {
      title: "Queries",
      metrics: [
        { key: "totalQueries", label: "Total", format: fmtNumber(0) },
        { key: "blockedQueries", label: "Blocked", format: fmtNumber(0) },
        { key: "allowedQueries", label: "Allowed", format: fmtNumber(0) },
        { key: "blockingRate", label: "Block rate", format: fmtPercent(2, 100) },
        { key: "avgProcessingTime", label: "Avg proc (ms)", format: fmtNumber(2) },
      ],
    },
    {
      title: "Filters",
      metrics: [
        { key: "safebrowsingBlocked", label: "Safebrowsing", format: fmtNumber(0) },
        { key: "safesearchBlocked", label: "Safesearch", format: fmtNumber(0) },
        { key: "parentalBlocked", label: "Parental", format: fmtNumber(0) },
        { key: "filterCount", label: "Filter lists", format: fmtNumber(0) },
        { key: "totalRules", label: "Rules total", format: fmtNumber(0) },
        { key: "userRules", label: "Custom rules", format: fmtNumber(0) },
      ],
    },
    {
      title: "Clients",
      metrics: [
        { key: "clientCount", label: "Clients", format: fmtNumber(0) },
        { key: "autoClientCount", label: "Auto clients", format: fmtNumber(0) },
        { key: "dhcpLeases", label: "DHCP leases", format: fmtNumber(0) },
        { key: "dhcpStaticLeases", label: "DHCP static", format: fmtNumber(0) },
      ],
    },
    {
      title: "Network",
      metrics: [
        { key: "dnsPort", label: "DNS port", format: fmtRaw },
        { key: "httpPort", label: "HTTP port", format: fmtRaw },
        { key: "upstreamCount", label: "Upstreams", format: fmtNumber(0) },
        { key: "upstreamMode", label: "Upstream mode", format: fmtRaw },
      ],
    },
  ],

  charts: [
    { metric: "blockingRate", label: "Block rate", kind: "area", format: fmtPercent(1, 100) },
    { metric: "totalQueries", label: "Total queries", kind: "area", format: fmtNumber(0) },
    { metric: "blockedQueries", label: "Blocked", kind: "area", format: fmtNumber(0) },
    { metric: "avgProcessingTime", label: "Avg proc", kind: "line", format: fmtNumber(2) },
  ],

  customPanel: ({ stats }) => renderAdGuardPanel(stats),
  customPanelLabel: "Top & filters",

  tone: ({ stats, health }) => {
    if (health?.status === "offline") return "crit";
    if (health?.status === "warning") return "warn";
    if (stats && dotGet(stats, "running") === false) return "crit";
    if (stats && dotGet(stats, "protectionEnabled") === false) return "warn";
    return "ok";
  },
};
