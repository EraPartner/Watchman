import type { ServiceRenderer } from "./types";
import { buildQuickLink } from "./quickLink";
import {
  dotGet,
  fmtBytes,
  fmtNumber,
  fmtPercent,
  fmtRaw,
  fmtTempC,
  fmtUptime,
} from "./formatters";

type Stats = Record<string, unknown>;

const getNum = (s: Stats | undefined, path: string): number | undefined => {
  const v = s ? dotGet(s, path) : undefined;
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
};

export const macMiniRenderer: ServiceRenderer<Stats> = {
  kind: "macMini",
  displayName: "Mac Mini",
  quickLink: (ctx) =>
    buildQuickLink(ctx, {
      hostKeys: ["host", "address"],
      portKeys: ["port"],
      scheme: "https",
    }),
  quickLinkLabel: "Open host",

  summary: [
    { key: "cpuUsagePercent", label: "CPU", format: fmtPercent(0, 100) },
    { key: "cpuTemp", label: "Temp", format: fmtTempC },
    { key: "diskUsagePercent", label: "Disk", format: fmtPercent(0, 100) },
  ],

  detail: [
    {
      title: "CPU",
      metrics: [
        { key: "cpuUsagePercent", label: "Usage", format: fmtPercent(1, 100) },
        // cpuLoad is the 1-minute load average, not a percentage
        { key: "cpuLoad", label: "Load avg (1m)", format: fmtNumber(2) },
        { key: "cpuTemp", label: "Temperature", format: fmtTempC },
      ],
    },
    {
      title: "Disk",
      metrics: [
        { key: "diskTotal", label: "Total", format: fmtBytes },
        { key: "diskUsed", label: "Used", format: fmtBytes },
        { key: "diskFree", label: "Free", format: fmtBytes },
        { key: "diskUsagePercent", label: "Used %", format: fmtPercent(1, 100) },
      ],
    },
    {
      title: "Host",
      metrics: [
        { key: "host", label: "Hostname", format: fmtRaw },
        { key: "uptime", label: "Uptime", format: fmtUptime },
      ],
    },
  ],

  charts: [
    { metric: "cpuUsagePercent", label: "CPU usage", kind: "area", format: fmtPercent(0, 100) },
    { metric: "cpuLoad", label: "Load avg", kind: "line", format: fmtNumber(2) },
    { metric: "cpuTemp", label: "CPU temp", kind: "line", format: fmtTempC },
    { metric: "diskUsagePercent", label: "Disk used", kind: "area", format: fmtPercent(0, 100) },
  ],

  tone: ({ stats, health }) => {
    if (health?.status === "offline") return "crit";
    if (health?.status === "warning") return "warn";
    const cpu = getNum(stats, "cpuUsagePercent");
    const temp = getNum(stats, "cpuTemp");
    const disk = getNum(stats, "diskUsagePercent");
    if ((cpu ?? 0) >= 90 || (temp ?? 0) >= 90 || (disk ?? 0) >= 95) return "crit";
    if ((cpu ?? 0) >= 80 || (temp ?? 0) >= 80 || (disk ?? 0) >= 85) return "warn";
    return "ok";
  },
};
