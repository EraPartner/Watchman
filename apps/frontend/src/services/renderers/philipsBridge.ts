import type { ServiceRenderer } from "./types";
import { buildQuickLink } from "./quickLink";
import { fmtBool, fmtList, fmtNumber, fmtRaw } from "./formatters";

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
        {
          key: "unreachableDevices",
          label: "Which are unreachable",
          format: fmtList((d) => String(d["name"])),
        },
        { key: "batteryLowCount", label: "Low batteries", format: fmtRaw },
        {
          key: "lowBatteryDevices",
          label: "Which are low",
          format: fmtList((d) =>
            typeof d["level"] === "number"
              ? `${String(d["name"])} (${d["level"]}%)`
              : String(d["name"])
          ),
        },
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

  tone: ({ health, stats }) => {
    if (health?.status === "offline") return "crit";
    if (health?.status === "warning") return "warn";
    // an unreachable device or a low battery needs attention even though
    // the bridge itself is fine
    const s = stats as Record<string, unknown> | undefined;
    const unreachable = s?.["zigbeeUnreachableCount"];
    const lowBattery = s?.["batteryLowCount"];
    if (typeof unreachable === "number" && unreachable > 0) return "warn";
    if (typeof lowBattery === "number" && lowBattery > 0) return "warn";
    return "ok";
  },
};
