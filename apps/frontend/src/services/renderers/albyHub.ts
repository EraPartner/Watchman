import type { ServiceRenderer } from "./types";
import { buildQuickLink } from "./quickLink";
import { dotGet, fmtBool, fmtNumber, fmtRaw } from "./formatters";

type Stats = Record<string, unknown>;

export const albyHubRenderer: ServiceRenderer<Stats> = {
  kind: "albyhub",
  displayName: "Alby Hub",
  quickLink: (ctx) =>
    buildQuickLink(ctx, {
      hostKeys: ["url", "endpoint", "host"],
    }),
  quickLinkLabel: "Open Alby Hub",

  summary: [
    { key: "version", label: "Version", format: fmtRaw },
    { key: "appCount", label: "Apps", format: fmtNumber(0) },
    { key: "connected", label: "Connected", format: fmtBool("yes", "no") },
  ],

  detail: [
    {
      title: "Identity",
      metrics: [
        { key: "name", label: "Name", format: fmtRaw },
        { key: "description", label: "Description", format: fmtRaw },
        { key: "version", label: "Version", format: fmtRaw },
      ],
    },
    {
      title: "Network",
      metrics: [
        { key: "reachable", label: "Reachable", format: fmtBool("yes", "no"), source: 'health' },
        { key: "endpoint", label: "Endpoint", format: fmtRaw },
        { key: "url", label: "URL", format: fmtRaw },
      ],
    },
    {
      title: "NWC",
      metrics: [
        { key: "connected", label: "Connected", format: fmtBool("yes", "no") },
        { key: "setupCompleted", label: "Setup complete", format: fmtBool("yes", "no") },
        { key: "backendType", label: "Backend", format: fmtRaw },
        { key: "appCount", label: "Apps", format: fmtNumber(0) },
      ],
    },
  ],

  charts: [
    { metric: "appCount", label: "Apps", kind: "line", format: fmtNumber(0) },
  ],

  tone: ({ stats, health }) => {
    if (health?.status === "offline") return "crit";
    if (health?.status === "warning") return "warn";
    if (stats && dotGet(stats, "reachable") === false) return "crit";
    return "ok";
  },
};
