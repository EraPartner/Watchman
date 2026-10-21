import type { MetricFormatter, ServiceRenderer } from "./types";
import { buildQuickLink } from "./quickLink";
import {
  dotGet,
  fmtBytes,
  fmtNumber,
  fmtPercent,
  fmtRaw,
  fmtUptime,
} from "./formatters";

type Stats = Record<string, unknown>;

// SNMP sysUpTime is TimeTicks (hundredths of a second)
const fmtTicks: MetricFormatter = (v) =>
  typeof v === "number" && Number.isFinite(v) ? fmtUptime(v / 100) : "—";

const fmtRate: MetricFormatter = (v) => {
  const s = fmtBytes(v);
  return s === "—" ? s : `${s}/s`;
};

export const routerRenderer: ServiceRenderer<Stats> = {
  kind: "router",
  displayName: "Router",
  quickLink: (ctx) =>
    buildQuickLink(ctx, {
      hostKeys: ["host", "uiUrl", "address"],
      portKeys: ["uiPort"],
      scheme: "http",
    }),
  quickLinkLabel: "Open router UI",

  summary: [
    { key: "reachable", label: "Reachable", source: "health", format: fmtRaw },
    { key: "portCount", label: "Ports", format: fmtNumber(0) },
    { key: "host", label: "Host", format: fmtRaw },
  ],

  detail: [
    {
      title: "Status",
      metrics: [
        { key: "reachable", label: "Reachable", source: "health", format: fmtRaw },
        { key: "host", label: "Host", format: fmtRaw },
        { key: "configured", label: "Configured", format: fmtRaw },
        { key: "portCount", label: "Ports configured", format: fmtNumber(0) },
      ],
    },
    {
      // present only when an SNMP community is configured
      title: "SNMP",
      metrics: [
        { key: "sysUptime", label: "Uptime", format: fmtTicks },
        { key: "cpuLoad", label: "CPU load", format: fmtPercent(0, 100) },
        { key: "connectedClients", label: "ARP entries", format: fmtNumber(0) },
        { key: "ifInBps", label: "Download", format: fmtRate },
        { key: "ifOutBps", label: "Upload", format: fmtRate },
        { key: "ifInOctets", label: "Bytes in", format: fmtBytes },
        { key: "ifOutOctets", label: "Bytes out", format: fmtBytes },
      ],
    },
  ],

  charts: [
    { metric: "portCount", label: "Ports configured", kind: "line", format: fmtNumber(0) },
    { metric: "ifInBps", label: "Download", kind: "area", format: fmtRate },
    { metric: "ifOutBps", label: "Upload", kind: "area", format: fmtRate },
    { metric: "cpuLoad", label: "CPU load", kind: "line", format: fmtPercent(0, 100) },
  ],

  tone: ({ stats, health }) => {
    if (health?.status === "offline") return "crit";
    if (health?.status === "warning") return "warn";
    if (stats && dotGet(stats, "reachable") === false) return "crit";
    return "ok";
  },
};
