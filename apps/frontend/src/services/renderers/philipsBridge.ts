import type { ServiceRenderer } from "./types";
import { dotGet, fmtBool, fmtNumber, fmtRaw } from "./formatters";

type Stats = Record<string, unknown>;

export const philipsBridgeRenderer: ServiceRenderer<Stats> = {
  kind: "philips",
  displayName: "Hue Bridge",

  summary: [
    { key: "reachable", label: "Reachable", format: fmtBool() },
    { key: "onCount", label: "Lights on", format: fmtNumber(0) },
  ],

  detail: [
    {
      title: "Bridge",
      metrics: [
        { key: "reachable", label: "Reachable", format: fmtBool() },
        { key: "host", label: "Host", format: fmtRaw },
        { key: "lightCount", label: "Total lights", format: fmtNumber(0) },
        { key: "onCount", label: "Lights on", format: fmtNumber(0) },
        { key: "offCount", label: "Lights off", format: fmtNumber(0) },
      ],
    },
  ],

  charts: [
    { metric: "lightCount", label: "Total lights", kind: "line", format: fmtNumber(0) },
    { metric: "onCount", label: "Lights on", kind: "area", format: fmtNumber(0) },
    { metric: "offCount", label: "Lights off", kind: "area", format: fmtNumber(0) },
  ],

  tone: ({ stats, health }) => {
    if (health?.status === "offline") return "crit";
    if (health?.status === "warning") return "warn";
    if (stats && dotGet(stats, "reachable") === false) return "crit";
    return "ok";
  },
};
