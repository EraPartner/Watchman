import type { ServiceRenderer } from "./types";
import {
  dotGet,
  fmtBytes,
  fmtPercent,
  fmtRaw,
  fmtTempC,
  fmtUptime,
} from "./formatters";

type SynologyStats = Record<string, unknown>;

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

  summary: [
    { key: "cpu.usage", label: "CPU", format: fmtPercent(0, 100) },
    { key: "cpu.temperature", label: "Temp", format: fmtTempC },
    { key: "network.bytesReceived", label: "Net RX", format: fmtBytes },
  ],

  detail: [
    {
      title: "System",
      metrics: [
        { key: "system.name", label: "Name", format: fmtRaw },
        { key: "system.model", label: "Model", format: fmtRaw },
        { key: "system.version", label: "DSM version", format: fmtRaw },
        { key: "system.status", label: "Status", format: fmtRaw },
        { key: "system.uptime", label: "Uptime", format: fmtUptime },
      ],
    },
    {
      title: "CPU",
      metrics: [
        { key: "cpu.usage", label: "Usage", format: fmtPercent(1, 100) },
        { key: "cpu.temperature", label: "Temperature", format: fmtTempC },
      ],
    },
    {
      title: "Network",
      metrics: [
        {
          key: "network.bytesReceived",
          label: "Bytes received",
          format: fmtBytes,
        },
        {
          key: "network.bytesTransmitted",
          label: "Bytes transmitted",
          format: fmtBytes,
        },
      ],
    },
    {
      title: "Status",
      metrics: [
        { key: "status", label: "Service", format: fmtRaw },
        { key: "timestamp", label: "Last update", format: fmtRaw },
      ],
    },
  ],

  charts: [
    {
      metric: "cpu.usage",
      label: "CPU usage",
      kind: "area",
      format: fmtPercent(0, 100),
    },
    {
      metric: "cpu.temperature",
      label: "CPU temperature",
      kind: "line",
      format: fmtTempC,
    },
    {
      metric: "network.bytesReceived",
      label: "Network RX",
      kind: "area",
      format: fmtBytes,
    },
    {
      metric: "network.bytesTransmitted",
      label: "Network TX",
      kind: "area",
      format: fmtBytes,
    },
  ],

  tone: ({ stats, health }) => {
    if (health?.status === "offline") return "crit";
    if (health?.status === "warning") return "warn";
    const status = stats ? dotGet(stats, "status") : undefined;
    if (status === "error" || status === "offline") return "crit";
    const cpu = getNum(stats, "cpu.usage");
    const temp = getNum(stats, "cpu.temperature");
    if ((cpu ?? 0) >= 90 || (temp ?? 0) >= 80) return "crit";
    if ((cpu ?? 0) >= 80 || (temp ?? 0) >= 70) return "warn";
    return "ok";
  },

  subtitle: ({ stats }) => {
    const model = stats ? dotGet(stats, "system.model") : undefined;
    return typeof model === "string" ? model : null;
  },
};
