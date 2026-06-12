import type { ServiceRenderer } from "./types";
import { buildQuickLink } from "./quickLink";
import { fmtBool, fmtNumber, fmtRaw } from "./formatters";

type Stats = Record<string, unknown>;

export const philipsBridgeRenderer: ServiceRenderer<Stats> = {
  kind: "philipsBridge",
  displayName: "Hue Bridge",
  quickLink: (ctx) =>
    buildQuickLink(ctx, {
      hostKeys: ["host"],
      scheme: "https",
    }),
  quickLinkLabel: "Open Hue Bridge",

  summary: [
    { key: "lightCount", label: "Lights", format: fmtNumber(0) },
    { key: "onCount", label: "On", format: fmtNumber(0) },
    { key: "offCount", label: "Off", format: fmtNumber(0) },
  ],

  detail: [
    {
      title: "Bridge",
      metrics: [
        {
          key: "reachable",
          label: "Reachable",
          format: fmtBool("yes", "no"),
          source: "health",
        },
        { key: "host", label: "Host", format: fmtRaw },
        {
          key: "configured",
          label: "Configured",
          format: fmtBool("yes", "no"),
        },
        { key: "lightCount", label: "Total lights", format: fmtNumber(0) },
        { key: "onCount", label: "Lights on", format: fmtNumber(0) },
        { key: "offCount", label: "Lights off", format: fmtNumber(0) },
      ],
    },
    {
      title: "Zigbee & devices",
      metrics: [
        {
          key: "sseConnected",
          label: "Live events",
          format: fmtBool("connected", "polling"),
        },
        {
          key: "zigbeeUnreachableCount",
          label: "Unreachable devices",
          format: fmtRaw,
        },
        { key: "batteryLowCount", label: "Low batteries", format: fmtRaw },
        { key: "minBatteryPercent", label: "Lowest battery %", format: fmtRaw },
        { key: "deviceCount", label: "Devices", format: fmtRaw },
        { key: "roomCount", label: "Rooms", format: fmtRaw },
      ],
    },
  ],

  charts: [
    {
      metric: "lightCount",
      label: "Total lights",
      kind: "line",
      format: fmtNumber(0),
    },
    {
      metric: "onCount",
      label: "Lights on",
      kind: "area",
      format: fmtNumber(0),
    },
    {
      metric: "offCount",
      label: "Lights off",
      kind: "area",
      format: fmtNumber(0),
    },
  ],

  tone: ({ health }) => {
    if (health?.status === "offline") return "crit";
    if (health?.status === "warning") return "warn";
    return "ok";
  },
};
