import type { ServiceRenderer } from "./types";
import {
  dotGet,
  fmtBytes,
  fmtNumber,
  fmtRaw,
  fmtUptime,
} from "./formatters";

type Stats = Record<string, unknown>;

export const qbittorrentRenderer: ServiceRenderer<Stats> = {
  kind: "qbittorrent",
  displayName: "qBittorrent",

  summary: [
    { key: "dlSpeed", label: "DL/s", format: fmtBytes },
    { key: "upSpeed", label: "UL/s", format: fmtBytes },
    { key: "torrentsTotal", label: "Torrents", format: fmtNumber(0) },
  ],

  detail: [
    {
      title: "Traffic",
      metrics: [
        { key: "dlSpeed", label: "DL speed", format: fmtBytes },
        { key: "upSpeed", label: "UL speed", format: fmtBytes },
        { key: "dlData", label: "DL total", format: fmtBytes },
        { key: "upData", label: "UL total", format: fmtBytes },
      ],
    },
    {
      title: "Torrents",
      metrics: [
        { key: "torrentsTotal", label: "Total", format: fmtNumber(0) },
        { key: "torrentsDownloading", label: "Downloading", format: fmtNumber(0) },
        { key: "torrentsSeeding", label: "Seeding", format: fmtNumber(0) },
        { key: "torrentsPaused", label: "Paused", format: fmtNumber(0) },
        { key: "torrentsCompleted", label: "Completed", format: fmtNumber(0) },
      ],
    },
    {
      title: "System",
      metrics: [
        { key: "connectionStatus", label: "Connection", format: fmtRaw },
        { key: "freeSpaceOnDisk", label: "Free space", format: fmtBytes },
        { key: "dhtNodes", label: "DHT nodes", format: fmtNumber(0) },
        { key: "listenPort", label: "Port", format: fmtRaw },
        { key: "version", label: "Version", format: fmtRaw },
        { key: "uptime", label: "Uptime", format: fmtUptime },
      ],
    },
  ],

  charts: [
    { metric: "dlSpeed", label: "DL speed", kind: "area", format: fmtBytes },
    { metric: "upSpeed", label: "UL speed", kind: "area", format: fmtBytes },
    { metric: "torrentsDownloading", label: "Downloading", kind: "line", format: fmtNumber(0) },
    { metric: "torrentsSeeding", label: "Seeding", kind: "line", format: fmtNumber(0) },
    { metric: "dlData", label: "DL total", kind: "area", format: fmtBytes },
    { metric: "upData", label: "UL total", kind: "area", format: fmtBytes },
    { metric: "freeSpaceOnDisk", label: "Free space", kind: "line", format: fmtBytes },
    { metric: "dhtNodes", label: "DHT nodes", kind: "line", format: fmtNumber(0) },
  ],

  tone: ({ stats, health }) => {
    if (health?.status === "offline") return "crit";
    if (health?.status === "warning") return "warn";
    const conn = stats ? dotGet(stats, "connectionStatus") : undefined;
    if (conn === "disconnected") return "crit";
    if (conn === "firewalled") return "warn";
    return "ok";
  },
};
