import type { ServiceRenderer } from "./types";
import { buildQuickLink } from "./quickLink";
import { dotGet, fmtRaw } from "./formatters";

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
    { key: "name", label: "Name", format: fmtRaw },
    { key: "version", label: "Version", format: fmtRaw },
    { key: "reachable", label: "Reachable", format: fmtRaw },
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
        { key: "reachable", label: "Reachable", format: fmtRaw },
        { key: "endpoint", label: "Endpoint", format: fmtRaw },
        { key: "url", label: "URL", format: fmtRaw },
      ],
    },
  ],

  charts: [],

  tone: ({ stats, health }) => {
    if (health?.status === "offline") return "crit";
    if (health?.status === "warning") return "warn";
    if (stats && dotGet(stats, "reachable") === false) return "crit";
    return "ok";
  },
};
