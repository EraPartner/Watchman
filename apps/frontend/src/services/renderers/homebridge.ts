import type { ServiceRenderer } from "./types";
import { buildQuickLink } from "./quickLink";
import {
  dotGet,
  fmtNumber,
  fmtPercent,
  fmtRaw,
  fmtTempC,
  fmtUptime,
} from "./formatters";

type Stats = Record<string, unknown>;

export const homebridgeRenderer: ServiceRenderer<Stats> = {
  kind: "homebridge",
  displayName: "Homebridge",
  quickLink: (ctx) =>
    buildQuickLink(ctx, {
      hostKeys: ["url", "host"],
      portKeys: ["port"],
      defaultPort: 8581,
    }),
  quickLinkLabel: "Open Homebridge UI",

  summary: [
    { key: "cpuTemp", label: "CPU temp", format: fmtTempC },
    { key: "cpuLoad", label: "CPU", format: fmtPercent(0, 100) },
    { key: "accessoryCount", label: "Accessories", format: fmtNumber(0) },
  ],

  subtitle: ({ stats }) => {
    const v = stats ? dotGet(stats, "currentVersion") : undefined;
    return typeof v === "string" && v.length > 0 && v !== "unknown"
      ? `v${v}`
      : null;
  },

  detail: [
    {
      title: "Versions",
      metrics: [
        { key: "currentVersion", label: "UI version", format: fmtRaw },
        { key: "latestVersion", label: "Latest", format: fmtRaw },
        { key: "homebridgeVersion", label: "Homebridge", format: fmtRaw },
        { key: "serverVersion", label: "Server", format: fmtRaw },
      ],
    },
    {
      title: "Bridge",
      metrics: [
        { key: "status", label: "Status", format: fmtRaw },
        { key: "childBridgesUp", label: "Child bridges up", format: fmtRaw },
        { key: "childBridgeCount", label: "Child bridges", format: fmtRaw },
        { key: "pluginCount", label: "Plugins", format: fmtRaw },
        {
          key: "pluginUpdatesAvailable",
          label: "Plugin updates",
          format: fmtRaw,
        },
        { key: "accessoryCount", label: "Accessories", format: fmtRaw },
      ],
    },
    {
      title: "Host",
      metrics: [
        { key: "hostname", label: "Hostname", format: fmtRaw },
        { key: "platform", label: "Platform", format: fmtRaw },
        { key: "cpuLoad", label: "CPU load", format: fmtPercent(0, 100) },
        { key: "cpuTemp", label: "CPU temp", format: fmtTempC },
        { key: "hostUptime", label: "Host uptime", format: fmtUptime },
        { key: "processUptime", label: "Process uptime", format: fmtUptime },
      ],
    },
  ],

  charts: [
    {
      metric: "cpuLoad",
      label: "CPU load",
      kind: "area",
      format: fmtPercent(0, 100),
    },
    { metric: "cpuTemp", label: "CPU temp", kind: "line", format: fmtTempC },
    {
      metric: "processUptime",
      label: "Uptime",
      kind: "line",
      format: fmtUptime,
    },
  ],

  tone: ({ stats, health }) => {
    if (health?.status === "offline") return "crit";
    if (health?.status === "warning") return "warn";
    const s = stats as Record<string, unknown> | undefined;
    if (s && typeof s["status"] === "string" && s["status"] !== "up") {
      return "warn";
    }
    if (
      s &&
      typeof s["childBridgeCount"] === "number" &&
      typeof s["childBridgesUp"] === "number" &&
      s["childBridgesUp"] < s["childBridgeCount"]
    ) {
      return "warn";
    }
    return "ok";
  },
};
