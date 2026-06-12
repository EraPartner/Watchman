import type { ServiceRenderer } from "./types";
import { buildQuickLink } from "./quickLink";
import { dotGet, fmtBool, fmtNumber, fmtRaw } from "./formatters";

type Stats = Record<string, unknown>;

const fmtMsatAsSats = (value: unknown): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${Math.round(value / 1000).toLocaleString()} sats`;
};

const fmtSats = (value: unknown): string => {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toLocaleString()} sats`;
};

export const albyHubRenderer: ServiceRenderer<Stats> = {
  kind: "albyHub",
  displayName: "Alby Hub",
  quickLink: (ctx) =>
    buildQuickLink(ctx, {
      hostKeys: ["url", "endpoint", "host"],
    }),
  quickLinkLabel: "Open Alby Hub",

  summary: [
    { key: "version", label: "Version", format: fmtRaw },
    { key: "appCount", label: "Apps", format: fmtNumber(0) },
    { key: "connected", label: "Connected", format: fmtBool("yes", "no") },
  ],

  detail: [
    {
      title: "Identity",
      metrics: [
        { key: "name", label: "Name", format: fmtRaw },
        { key: "description", label: "Description", format: fmtRaw },
        { key: "version", label: "Version", format: fmtRaw },
      ],
    },
    {
      title: "Network",
      metrics: [
        {
          key: "reachable",
          label: "Reachable",
          format: fmtBool("yes", "no"),
          source: "health",
        },
        { key: "endpoint", label: "Endpoint", format: fmtRaw },
        { key: "url", label: "URL", format: fmtRaw },
      ],
    },
    {
      title: "NWC",
      metrics: [
        { key: "connected", label: "Connected", format: fmtBool("yes", "no") },
        {
          key: "setupCompleted",
          label: "Setup complete",
          format: fmtBool("yes", "no"),
        },
        { key: "backendType", label: "Backend", format: fmtRaw },
        { key: "appCount", label: "Apps", format: fmtNumber(0) },
      ],
    },
    {
      title: "Wallet",
      metrics: [
        {
          key: "balanceLightningSpendableMsat",
          label: "LN spendable",
          format: fmtMsatAsSats,
        },
        {
          key: "balanceLightningReceivableMsat",
          label: "LN receivable",
          format: fmtMsatAsSats,
        },
        {
          key: "balanceOnchainSpendableSat",
          label: "On-chain spendable",
          format: fmtSats,
        },
        { key: "channelCount", label: "Channels", format: fmtRaw },
        { key: "channelsActive", label: "Active channels", format: fmtRaw },
        {
          key: "channelLocalBalanceMsat",
          label: "Local balance",
          format: fmtMsatAsSats,
        },
      ],
    },
  ],

  charts: [
    { metric: "appCount", label: "Apps", kind: "line", format: fmtNumber(0) },
    {
      metric: "balanceLightningSpendableMsat",
      label: "LN spendable (msat)",
      kind: "area",
      format: fmtMsatAsSats,
    },
  ],

  tone: ({ stats, health }) => {
    if (health?.status === "offline") return "crit";
    if (health?.status === "warning") return "warn";
    if (stats && dotGet(stats, "reachable") === false) return "crit";
    return "ok";
  },
};
