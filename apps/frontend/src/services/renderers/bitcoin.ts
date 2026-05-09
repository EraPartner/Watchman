import type { BitcoinStats } from "@/types/api";
import type { ServiceRenderer } from "./types";
import { buildQuickLink } from "./quickLink";
import {
  fmtBytes,
  fmtNumber,
  fmtPercent,
  fmtRaw,
  fmtUptime,
  fmtVersion,
} from "./formatters";

export const bitcoinRenderer: ServiceRenderer<BitcoinStats> = {
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
        { key: "mempool.size", label: "Tx count", format: fmtNumber(0) },
        { key: "mempool.bytes", label: "Size", format: fmtBytes },
        { key: "mempool.usage", label: "Memory", format: fmtBytes },
        { key: "mempool.maxmempool", label: "Max", format: fmtBytes },
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
    { metric: "mempool.bytes", label: "Mempool size", kind: "area", format: fmtBytes },
  ],

  tone: ({ stats, health }) => {
    if (health?.status === "offline") return "crit";
    if (health?.status === "warning") return "warn";
    if (stats?.initialBlockDownload === true) return "warn";
    if (stats && stats.connections <= 1) return "warn";
    return "ok";
  },

  subtitle: ({ stats }) => {
    if (!stats) return null;
    if (stats.initialBlockDownload) return "Syncing";
    if (stats.verificationProgress >= 0.9999) return "Full node";
    return "Synced";
  },
};
