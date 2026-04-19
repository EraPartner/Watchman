import type { ServiceRenderer } from "./types";
import {
  dotGet,
  fmtBytes,
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
  kind: "macmini",
  displayName: "Mac Mini",

  summary: [
    { key: "cpuLoad", label: "CPU", format: fmtPercent(0, 100) },
    { key: "cpuTemp", label: "Temp", format: fmtTempC },
    { key: "diskUsagePercent", label: "Disk", format: fmtPercent(0, 100) },
  ],

  detail: [
    {
      title: "CPU",
      metrics: [
        { key: "cpuLoad", label: "Load", format: fmtPercent(1, 100) },
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
    { metric: "cpuLoad", label: "CPU load", kind: "area", format: fmtPercent(0, 100) },
    { metric: "cpuTemp", label: "CPU temp", kind: "line", format: fmtTempC },
    { metric: "diskUsagePercent", label: "Disk used", kind: "area", format: fmtPercent(0, 100) },
  ],

  tone: ({ stats, health }) => {
    if (health?.status === "offline") return "crit";
    if (health?.status === "warning") return "warn";
    const cpu = getNum(stats, "cpuLoad");
    const temp = getNum(stats, "cpuTemp");
    const disk = getNum(stats, "diskUsagePercent");
    if ((cpu ?? 0) >= 90 || (temp ?? 0) >= 90 || (disk ?? 0) >= 95) return "crit";
    if ((cpu ?? 0) >= 80 || (temp ?? 0) >= 80 || (disk ?? 0) >= 85) return "warn";
    return "ok";
  },
};
