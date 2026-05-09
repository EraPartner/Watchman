import type { ServiceRenderer } from "./types";
import { buildQuickLink } from "./quickLink";
import { dotGet, fmtNumber, fmtRaw } from "./formatters";

type Stats = Record<string, unknown>;

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
    { key: "reachable", label: "Reachable", format: fmtRaw },
    { key: "portCount", label: "Ports", format: fmtNumber(0) },
    { key: "host", label: "Host", format: fmtRaw },
  ],

  detail: [
    {
      title: "Status",
      metrics: [
        { key: "reachable", label: "Reachable", format: fmtRaw },
        { key: "host", label: "Host", format: fmtRaw },
        { key: "configured", label: "Configured", format: fmtRaw },
        { key: "pingEnabled", label: "Ping enabled", format: fmtRaw },
        { key: "portCount", label: "Port count", format: fmtNumber(0) },
      ],
    },
  ],

  charts: [
    { metric: "portCount", label: "Ports reachable", kind: "line", format: fmtNumber(0) },
  ],

  tone: ({ stats, health }) => {
    if (health?.status === "offline") return "crit";
    if (health?.status === "warning") return "warn";
    if (stats && dotGet(stats, "reachable") === false) return "crit";
    return "ok";
  },
};
