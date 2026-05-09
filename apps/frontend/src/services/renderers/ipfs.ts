import type { ServiceRenderer } from "./types";
import { buildQuickLink } from "./quickLink";
import { fmtBytes, fmtNumber, fmtRaw } from "./formatters";

type Stats = Record<string, unknown>;

export const ipfsRenderer: ServiceRenderer<Stats> = {
  kind: "ipfs",
  displayName: "IPFS",
  quickLink: (ctx) =>
    buildQuickLink(ctx, {
      hostKeys: ["webuiUrl", "host"],
      portKeys: ["webuiPort", "port", "apiPort"],
      defaultPort: 5001,
      path: "/webui",
    }),
  quickLinkLabel: "Open WebUI",

  summary: [
    { key: "peers", label: "Peers", format: fmtNumber(0) },
    { key: "repoSize", label: "Repo", format: fmtBytes },
    { key: "bwRateIn", label: "In/s", format: fmtBytes },
  ],

  detail: [
    {
      title: "Peers",
      metrics: [
        { key: "peers", label: "Connected", format: fmtNumber(0) },
        { key: "addressCount", label: "Addresses", format: fmtNumber(0) },
      ],
    },
    {
      title: "Repo",
      metrics: [
        { key: "repoSize", label: "Size", format: fmtBytes },
        { key: "numObjects", label: "Objects", format: fmtNumber(0) },
      ],
    },
    {
      title: "Bandwidth",
      metrics: [
        { key: "bwRateIn", label: "Rate in", format: fmtBytes },
        { key: "bwRateOut", label: "Rate out", format: fmtBytes },
        { key: "bwTotalIn", label: "Total in", format: fmtBytes },
        { key: "bwTotalOut", label: "Total out", format: fmtBytes },
      ],
    },
    {
      title: "Node",
      metrics: [
        { key: "nodeId", label: "Node ID", format: fmtRaw },
        { key: "version", label: "Version", format: fmtRaw },
      ],
    },
  ],

  charts: [
    { metric: "peers", label: "Peers", kind: "line", format: fmtNumber(0) },
    { metric: "repoSize", label: "Repo size", kind: "area", format: fmtBytes },
    { metric: "bwRateIn", label: "BW in", kind: "area", format: fmtBytes },
    { metric: "bwRateOut", label: "BW out", kind: "area", format: fmtBytes },
    { metric: "numObjects", label: "Objects", kind: "area", format: fmtNumber(0) },
  ],

  tone: ({ health }) => {
    if (health?.status === "offline") return "crit";
    if (health?.status === "warning") return "warn";
    return "ok";
  },
};
