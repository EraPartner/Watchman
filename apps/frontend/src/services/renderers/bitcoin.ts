import type { ServiceRenderer } from "./types";
import { buildQuickLink } from "./quickLink";
import {
  dotGet,
  fmtBytes,
  fmtNumber,
  fmtPercent,
  fmtRaw,
  fmtUptime,
  fmtVersion,
} from "./formatters";

type BitcoinStatsMetrics = Record<string, unknown>;

export const bitcoinRenderer: ServiceRenderer<BitcoinStatsMetrics> = {
  kind: "bitcoin",
  displayName: "Bitcoin Core",
  quickLink: (ctx) =>
    buildQuickLink(ctx, {
      hostKeys: ["onionUrl", "rpcHost", "host"],
      portKeys: ["rpcPort", "port"],
    }),
  quickLinkLabel: "Open RPC host",

  summary: [
    { key: "blocks", label: "Blocks", format: fmtNumber(0) },
    { key: "connections", label: "Peers", format: fmtNumber(0) },
    { key: "verificationProgress", label: "Sync", format: fmtPercent(2, 100) },
  ],

  detail: [
    {
      title: "Chain",
      metrics: [
        { key: "chain", label: "Network", format: fmtRaw },
        { key: "blocks", label: "Blocks", format: fmtNumber(0) },
        { key: "headers", label: "Headers", format: fmtNumber(0) },
        {
          key: "verificationProgress",
          label: "Sync progress",
          format: fmtPercent(3, 100),
        },
        {
          key: "initialBlockDownload",
          label: "IBD",
          format: (v) => (v === true ? "syncing" : v === false ? "done" : "—"),
        },
        { key: "blockchainSize", label: "On-disk size", format: fmtBytes },
        { key: "difficulty", label: "Difficulty", format: fmtNumber(0) },
        { key: "networkHashPs", label: "Network H/s", format: fmtNumber(0) },
      ],
    },
    {
      title: "Network",
      metrics: [
        { key: "connections", label: "Peers", format: fmtNumber(0) },
        { key: "inbound", label: "Inbound", format: fmtNumber(0) },
        { key: "outbound", label: "Outbound", format: fmtNumber(0) },
      ],
    },
    {
      title: "Mempool",
      metrics: [
        { key: "mempoolSize", label: "Tx count", format: fmtNumber(0) },
        { key: "mempoolBytes", label: "Size", format: fmtBytes },
        { key: "mempoolUsage", label: "Memory", format: fmtBytes },
        { key: "mempoolMax", label: "Max", format: fmtBytes },
      ],
    },
    {
      title: "Runtime",
      metrics: [
        { key: "uptime", label: "Uptime", format: fmtUptime },
        { key: "version", label: "Version", format: fmtVersion },
        { key: "protocolVersion", label: "Protocol", format: fmtRaw },
      ],
    },
  ],

  charts: [
    { metric: "blocks", label: "Block height", kind: "area", format: fmtNumber(0) },
    { metric: "connections", label: "Peers", kind: "line", format: fmtNumber(0) },
    { metric: "mempoolBytes", label: "Mempool size", kind: "area", format: fmtBytes },
  ],

  tone: ({ stats, health }) => {
    if (health?.status === "offline") return "crit";
    if (health?.status === "warning") return "warn";
    if (dotGet(stats, "initialBlockDownload") === true) return "warn";
    const connections = dotGet(stats, "connections");
    if (typeof connections === "number" && connections <= 1) return "warn";
    return "ok";
  },

  subtitle: ({ stats }) => {
    if (!stats) return null;
    if (dotGet(stats, "initialBlockDownload") === true) return "Syncing";
    const vp = dotGet(stats, "verificationProgress");
    if (typeof vp === "number" && vp >= 0.9999) return "Full node";
    return "Synced";
  },
};
