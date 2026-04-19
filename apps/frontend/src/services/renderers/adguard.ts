import type { ServiceRenderer } from "./types";
import { dotGet, fmtNumber, fmtPercent, fmtRaw } from "./formatters";

type Stats = Record<string, unknown>;

export const adguardRenderer: ServiceRenderer<Stats> = {
  kind: "adguard",
  displayName: "AdGuard Home",

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
      ],
    },
    {
      title: "Network",
      metrics: [
        { key: "dnsPort", label: "DNS port", format: fmtRaw },
        { key: "httpPort", label: "HTTP port", format: fmtRaw },
      ],
    },
  ],

  charts: [
    { metric: "blockingRate", label: "Block rate", kind: "area", format: fmtPercent(1, 100) },
    { metric: "totalQueries", label: "Total queries", kind: "area", format: fmtNumber(0) },
    { metric: "blockedQueries", label: "Blocked", kind: "area", format: fmtNumber(0) },
    { metric: "avgProcessingTime", label: "Avg proc", kind: "line", format: fmtNumber(2) },
  ],

  tone: ({ stats, health }) => {
    if (health?.status === "offline") return "crit";
    if (health?.status === "warning") return "warn";
    if (stats && dotGet(stats, "running") === false) return "crit";
    if (stats && dotGet(stats, "protectionEnabled") === false) return "warn";
    return "ok";
  },
};
