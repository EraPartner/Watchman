import type { ServiceRenderer } from "./types";
import { buildQuickLink } from "./quickLink";
import { dotGet, fmtBool, fmtList, fmtNumber, fmtRaw } from "./formatters";

type Stats = Record<string, unknown>;

export const roonRenderer: ServiceRenderer<Stats> = {
  kind: "roon",
  displayName: "Roon Core",
  quickLink: (ctx) =>
    buildQuickLink(ctx, {
      hostKeys: ["host"],
    }),
  quickLinkLabel: "Open host",

  summary: [
    { key: "reachable", label: "Reachable", format: fmtBool("yes", "no"), source: 'health' },
    { key: "zoneCount", label: "Zones", format: fmtNumber(0) },
    { key: "activeZones", label: "Playing", format: fmtNumber(0) },
  ],

  detail: [
    {
      title: "Core",
      metrics: [
        { key: "reachable", label: "Reachable", format: fmtBool("yes", "no"), source: 'health' },
        { key: "host", label: "Host", format: fmtRaw },
        { key: "configured", label: "Configured", format: fmtBool("yes", "no") },
        { key: "pingEnabled", label: "Ping enabled", format: fmtBool("yes", "no") },
        { key: "portCount", label: "Ports", format: fmtNumber(0) },
      ],
    },
    {
      title: "Playback",
      metrics: [
        { key: "paired", label: "Paired", format: fmtBool("yes", "no") },
        { key: "zoneCount", label: "Zones", format: fmtNumber(0) },
        { key: "activeZones", label: "Active zones", format: fmtNumber(0) },
        { key: "nowPlaying", label: "Now playing", format: fmtRaw },
        {
          key: "zones",
          label: "Zones",
          format: fmtList(
            (z) =>
              `${String(z["name"])}: ${String(z["state"])}` +
              (Array.isArray(z["outputNames"]) && z["outputNames"].length > 0
                ? ` (${(z["outputNames"] as unknown[]).map(String).join(", ")})`
                : ""),
            10
          ),
        },
      ],
    },
  ],

  charts: [
    { metric: "zoneCount", label: "Zones", kind: "line", format: fmtNumber(0) },
    { metric: "activeZones", label: "Active zones", kind: "line", format: fmtNumber(0) },
  ],

  // Reachability lives in health (stats never carry `reachable`), and an
  // unreachable core already reports status "offline".
  tone: ({ health, stats }) => {
    if (health?.status === "offline") return "crit";
    if (health?.status === "warning") return "warn";
    // Roon API on (paired is only reported then) but Watchman not enabled
    // in Roon: zone data can't arrive
    if ((stats as Record<string, unknown> | undefined)?.["paired"] === false) {
      return "warn";
    }
    return "ok";
  },

  subtitle: ({ stats }) => {
    const now = stats ? dotGet(stats, "nowPlaying") : undefined;
    return typeof now === "string" && now.length > 0 ? now : null;
  },
};
