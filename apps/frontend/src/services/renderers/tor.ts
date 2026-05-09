import type { ServiceRenderer } from "./types";
import { dotGet, fmtBytes, fmtNumber, fmtRaw } from "./formatters";

type Stats = Record<string, unknown>;

export const torRenderer: ServiceRenderer<Stats> = {
  kind: "tor",
  displayName: "Tor Relay",
  quickLink: (ctx) => {
    const fp = ctx.config?.fingerprint;
    if (typeof fp === "string" && fp.length > 0) {
      return `https://metrics.torproject.org/rs.html#details/${encodeURIComponent(fp)}`;
    }
    return undefined;
  },
  quickLinkLabel: "View on Tor metrics",

  summary: [
    { key: "bandwidthCurrent", label: "BW/s", format: fmtBytes },
    { key: "consensusWeight", label: "Weight", format: fmtNumber(0) },
    { key: "relayType", label: "Type", format: fmtRaw },
  ],

  detail: [
    {
      title: "Status",
      metrics: [
        { key: "running", label: "Running", format: fmtRaw },
        { key: "hibernating", label: "Hibernating", format: fmtRaw },
        { key: "relayType", label: "Relay type", format: fmtRaw },
        { key: "flags", label: "Flags", format: fmtRaw },
      ],
    },
    {
      title: "Bandwidth",
      metrics: [
        { key: "bandwidthCurrent", label: "Current", format: fmtBytes },
        { key: "bandwidthBurst", label: "Burst", format: fmtBytes },
        { key: "consensusWeight", label: "Consensus weight", format: fmtNumber(0) },
      ],
    },
    {
      title: "Identity",
      metrics: [
        { key: "nickname", label: "Nickname", format: fmtRaw },
        { key: "fingerprint", label: "Fingerprint", format: fmtRaw },
        { key: "country", label: "Country", format: fmtRaw },
        { key: "city", label: "City", format: fmtRaw },
        { key: "firstSeen", label: "First seen", format: fmtRaw },
        { key: "lastSeen", label: "Last seen", format: fmtRaw },
        { key: "orPort", label: "OR port", format: fmtRaw },
        { key: "platform", label: "Platform", format: fmtRaw },
        { key: "version", label: "Version", format: fmtRaw },
        { key: "contact", label: "Contact", format: fmtRaw },
      ],
    },
  ],

  charts: [
    { metric: "bandwidthCurrent", label: "Bandwidth", kind: "area", format: fmtBytes },
    { metric: "bandwidthBurst", label: "Burst", kind: "line", format: fmtBytes },
    { metric: "consensusWeight", label: "Consensus weight", kind: "line", format: fmtNumber(0) },
  ],

  tone: ({ stats, health }) => {
    if (health?.status === "offline") return "crit";
    if (health?.status === "warning") return "warn";
    if (stats && dotGet(stats, "running") === false) return "crit";
    if (stats && dotGet(stats, "hibernating") === true) return "warn";
    return "ok";
  },
};
