import type { ReactNode } from "react";
import type { ServiceRenderer } from "./types";
import { buildQuickLink } from "./quickLink";
import { dotGet, fmtBytes, fmtNumber, fmtRaw } from "./formatters";

type Stats = Record<string, unknown>;

interface QbTorrentInfo {
  hash?: string;
  name?: string;
  state?: string;
  progress?: number;
  dlspeed?: number;
  upspeed?: number;
  size?: number;
  downloaded?: number;
  uploaded?: number;
  eta?: number;
  category?: string;
}

const STATE_TONE: Record<string, string> = {
  downloading: "var(--accent)",
  uploading: "var(--ok)",
  stalledDL: "var(--warn)",
  stalledUP: "var(--warn)",
  pausedDL: "var(--text-md)",
  pausedUP: "var(--text-md)",
  error: "var(--crit)",
  missingFiles: "var(--crit)",
};

function fmtEta(s?: number): string {
  if (!Number.isFinite(s) || s == null || s <= 0 || s >= 8_640_000) return "—";
  const total = Math.floor(s);
  const d = Math.floor(total / 86_400);
  const h = Math.floor((total % 86_400) / 3_600);
  const m = Math.floor((total % 3_600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function renderActivePanel(stats: Stats | undefined): ReactNode {
  const list = (stats?.activeTorrents as QbTorrentInfo[] | undefined) ?? [];
  const errors = (stats?.recentErrors as string[] | undefined) ?? [];
  const warnings = (stats?.recentWarnings as string[] | undefined) ?? [];

  if (list.length === 0 && errors.length === 0 && warnings.length === 0) {
    return (
      <p className="text-fs-label text-[var(--text-lo)]">
        No active torrents reported.
      </p>
    );
  }

  return (
    <div className="space-y-s-6">
      {list.length > 0 ? (
        <section className="space-y-s-2">
          <header className="flex items-baseline justify-between">
            <h3 className="text-fs-label font-[600] uppercase tracking-[0.06em] text-[var(--text-lo)]">
              Active torrents
            </h3>
            <span className="text-fs-label text-[var(--text-lo)]">
              top {list.length} by speed
            </span>
          </header>
          <ul className="divide-y divide-[var(--hairline)]">
            {list.map((t) => {
              const pct =
                typeof t.progress === "number"
                  ? Math.round(t.progress * 100)
                  : 0;
              const tone = STATE_TONE[t.state ?? ""] ?? "var(--text-md)";
              return (
                <li
                  key={t.hash ?? t.name ?? Math.random().toString(36)}
                  className="grid grid-cols-[1fr_auto] gap-x-s-3 gap-y-s-1 py-s-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-fs-body text-[var(--text-hi)]">
                      {t.name ?? t.hash ?? "—"}
                    </div>
                    <div className="mt-s-1 flex items-center gap-s-2 text-fs-label">
                      <span
                        className="font-mono uppercase"
                        style={{ color: tone }}
                      >
                        {t.state ?? "—"}
                      </span>
                      <span className="font-mono tabular-nums text-[var(--text-lo)]">
                        {pct}%
                      </span>
                      <span className="font-mono tabular-nums text-[var(--text-lo)]">
                        eta {fmtEta(t.eta)}
                      </span>
                      {t.category ? (
                        <span className="text-[var(--text-lo)]">
                          {t.category}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-s-1 h-[2px] w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(2, Math.min(100, pct))}%`,
                          background: tone,
                        }}
                      />
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums text-fs-label text-[var(--text-md)]">
                    <div>↓ {fmtBytes(t.dlspeed)}/s</div>
                    <div>↑ {fmtBytes(t.upspeed)}/s</div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {errors.length > 0 ? (
        <section className="space-y-s-2">
          <h3 className="text-fs-label font-[600] uppercase tracking-[0.06em] text-[var(--crit)]">
            Recent errors
          </h3>
          <ul className="space-y-s-1 text-fs-label text-[var(--text-md)]">
            {errors.slice(0, 8).map((m, i) => (
              <li key={i} className="font-mono">
                {m}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {warnings.length > 0 ? (
        <section className="space-y-s-2">
          <h3 className="text-fs-label font-[600] uppercase tracking-[0.06em] text-[var(--warn)]">
            Recent warnings
          </h3>
          <ul className="space-y-s-1 text-fs-label text-[var(--text-md)]">
            {warnings.slice(0, 8).map((m, i) => (
              <li key={i} className="font-mono">
                {m}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export const qbittorrentRenderer: ServiceRenderer<Stats> = {
  kind: "qbittorrent",
  displayName: "qBittorrent",
  quickLink: (ctx) =>
    buildQuickLink(ctx, {
      hostKeys: ["url", "host"],
      portKeys: ["port"],
      defaultPort: 8080,
    }),
  quickLinkLabel: "Open qBittorrent",
  customPanel: ({ stats }) => renderActivePanel(stats),
  customPanelLabel: "Torrents",

  summary: [
    { key: "upSpeed", label: "UL/s", format: fmtBytes },
    { key: "torrentsSeeding", label: "Seeding", format: fmtNumber(0) },
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
        {
          key: "torrentsDownloading",
          label: "Downloading",
          format: fmtNumber(0),
        },
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
        { key: "ratio", label: "Ratio", format: fmtRaw },
      ],
    },
  ],

  charts: [
    { metric: "dlSpeed", label: "DL speed", kind: "area", format: fmtBytes },
    { metric: "upSpeed", label: "UL speed", kind: "area", format: fmtBytes },
    {
      metric: "torrentsDownloading",
      label: "Downloading",
      kind: "line",
      format: fmtNumber(0),
    },
    {
      metric: "torrentsSeeding",
      label: "Seeding",
      kind: "line",
      format: fmtNumber(0),
    },
    { metric: "dlData", label: "DL total", kind: "area", format: fmtBytes },
    { metric: "upData", label: "UL total", kind: "area", format: fmtBytes },
    {
      metric: "freeSpaceOnDisk",
      label: "Free space",
      kind: "line",
      format: fmtBytes,
    },
    {
      metric: "dhtNodes",
      label: "DHT nodes",
      kind: "line",
      format: fmtNumber(0),
    },
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
