import type { ServiceRenderer } from "./types";
import { buildQuickLink } from "./quickLink";
import { fmtRaw, fmtUptime } from "./formatters";

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
    { key: "currentVersion", label: "Version", format: fmtRaw },
    { key: "homebridgeVersion", label: "HB core", format: fmtRaw },
    { key: "uptime", label: "Uptime", format: fmtUptime },
  ],

  detail: [
    {
      title: "Versions",
      metrics: [
        { key: "currentVersion", label: "UI version", format: fmtRaw },
        { key: "homebridgeVersion", label: "Homebridge", format: fmtRaw },
        { key: "serverVersion", label: "Server", format: fmtRaw },
      ],
    },
    {
      title: "Host",
      metrics: [
        { key: "hostname", label: "Hostname", format: fmtRaw },
        { key: "platform", label: "Platform", format: fmtRaw },
        { key: "uptime", label: "Uptime", format: fmtUptime },
      ],
    },
  ],

  charts: [
    { metric: "uptime", label: "Uptime", kind: "line", format: fmtUptime },
  ],

  tone: ({ health }) => {
    if (health?.status === "offline") return "crit";
    if (health?.status === "warning") return "warn";
    return "ok";
  },
};
