import type { MetricFormatter, ServiceRenderer } from "./types";
import { buildQuickLink } from "./quickLink";
import {
  dotGet,
  fmtBytes,
  fmtPercent,
  fmtRaw,
  fmtTempC,
  fmtUptime,
} from "./formatters";

type SynologyStats = Record<string, unknown>;

const fmtRate: MetricFormatter = (v) => {
  const s = fmtBytes(v);
  return s === "—" ? s : `${s}/s`;
};

const getNum = (
  s: SynologyStats | undefined,
  path: string
): number | undefined => {
  const v = s ? dotGet(s, path) : undefined;
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
};

export const synologyRenderer: ServiceRenderer<SynologyStats> = {
  kind: "synology",
  displayName: "Synology",
  quickLink: (ctx) =>
    buildQuickLink(ctx, {
      hostKeys: ["url", "host"],
      portKeys: ["port"],
      defaultPort: 5000,
      scheme: "https",
    }),
  quickLinkLabel: "Open DSM",

  summary: [
    { key: "cpuUsage", label: "CPU", format: fmtPercent(0, 100) },
    { key: "cpuTemp", label: "Temp", format: fmtTempC },
    // networkRx/networkTx are cumulative octet counters; the tile shows the rate
    { key: "networkRxBps", label: "Net RX", format: fmtRate },
  ],

  detail: [
    {
      title: "System",
      metrics: [
        { key: "systemName", label: "Name", format: fmtRaw },
        { key: "systemModel", label: "Model", format: fmtRaw },
        { key: "systemVersion", label: "DSM version", format: fmtRaw },
        { key: "systemStatus", label: "Status", format: fmtRaw },
        { key: "uptime", label: "Uptime", format: fmtUptime },
        // set only when a DSM API call failed (e.g. rejected login); "—" otherwise
        { key: "dsmError", label: "DSM API error", format: fmtRaw },
      ],
    },
    {
      title: "CPU",
      metrics: [
        { key: "cpuUsage", label: "Usage", format: fmtPercent(1, 100) },
        { key: "cpuTemp", label: "Temperature", format: fmtTempC },
      ],
    },
    {
      title: "Memory",
      metrics: [
        { key: "memoryTotal", label: "Total", format: fmtBytes },
        { key: "memoryUsed", label: "Used", format: fmtBytes },
        { key: "memoryAvailable", label: "Available", format: fmtBytes },
        { key: "memoryUsagePercent", label: "Used %", format: fmtPercent(1, 100) },
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
      title: "Network",
      metrics: [
        { key: "networkRxBps", label: "Receive rate", format: fmtRate },
        { key: "networkTxBps", label: "Transmit rate", format: fmtRate },
        { key: "networkRx", label: "Bytes received", format: fmtBytes },
        { key: "networkTx", label: "Bytes transmitted", format: fmtBytes },
      ],
    },
    {
      title: "Status",
      metrics: [
        { key: "host", label: "Host", format: fmtRaw, source: 'health' },
        { key: "latencyMs", label: "Latency", format: fmtRaw, source: 'health' },
      ],
    },
  ],

  charts: [
    {
      metric: "cpuUsage",
      label: "CPU usage",
      kind: "area",
      format: fmtPercent(0, 100),
    },
    {
      metric: "cpuTemp",
      label: "CPU temperature",
      kind: "line",
      format: fmtTempC,
    },
    {
      metric: "networkRxBps",
      label: "Network RX",
      kind: "area",
      format: fmtRate,
    },
    {
      metric: "networkTxBps",
      label: "Network TX",
      kind: "area",
      format: fmtRate,
    },
  ],

  tone: ({ stats, health }) => {
    if (health?.status === "offline") return "crit";
    if (health?.status === "warning") return "warn";
    // backend reports systemStatus as "Normal" | "Warning" | "Unknown"
    // (SYNOLOGY-SYSTEM-MIB systemStatus 2 = Failed maps to "Warning")
    const status = stats ? dotGet(stats, "systemStatus") : undefined;
    if (status === "Warning") return "crit";
    const cpu = getNum(stats, "cpuUsage");
    const temp = getNum(stats, "cpuTemp");
    if ((cpu ?? 0) >= 90 || (temp ?? 0) >= 80) return "crit";
    if ((cpu ?? 0) >= 80 || (temp ?? 0) >= 70) return "warn";
    // NAS answers, but the DSM API failed (bad password, login cooldown,
    // missing permission): DSM-sourced metrics are missing
    const dsmError = stats ? dotGet(stats, "dsmError") : undefined;
    if (typeof dsmError === "string" && dsmError.length > 0) return "warn";
    return "ok";
  },

  subtitle: ({ stats }) => {
    const model = stats ? dotGet(stats, "systemModel") : undefined;
    return typeof model === "string" && model.length > 0 ? model : null;
  },
};
