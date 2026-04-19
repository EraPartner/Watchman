import type { ServiceRenderer } from "./types";
import { dotGet, fmtRaw } from "./formatters";

type Stats = Record<string, unknown>;

export const philipsBridgeRenderer: ServiceRenderer<Stats> = {
  kind: "philips",
  displayName: "Hue Bridge",

  summary: [
    { key: "reachable", label: "Reachable", format: fmtRaw },
    { key: "host", label: "Host", format: fmtRaw },
  ],

  detail: [
    {
      title: "Bridge",
      metrics: [
        { key: "reachable", label: "Reachable", format: fmtRaw },
        { key: "host", label: "Host", format: fmtRaw },
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
