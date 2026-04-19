import type { ServiceRenderer } from "./types";
import { dotGet, fmtRaw } from "./formatters";

type Stats = Record<string, unknown>;

export const roonRenderer: ServiceRenderer<Stats> = {
  kind: "roon",
  displayName: "Roon Core",

  summary: [
    { key: "reachable", label: "Reachable", format: fmtRaw },
    { key: "host", label: "Host", format: fmtRaw },
  ],

  detail: [
    {
      title: "Core",
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
