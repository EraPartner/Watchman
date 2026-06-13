import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAggregatedHealth } from "@/hooks/useAggregatedHealth";
import {
  useBackendMetrics,
  summarizeBreakers,
} from "@/hooks/useBackendMetrics";
import { useWebSocketContext } from "@/providers/WebSocketProvider";
import { Button } from "@/components/primitives";
import { ProfileSwitcher } from "./ProfileSwitcher";
import { cn } from "@/lib/utils";

const NAV_ITEMS: ReadonlyArray<{ to: string; label: string }> = [
  { to: "/", label: "Dashboard" },
  { to: "/settings/services", label: "Services" },
  { to: "/settings/profiles", label: "Profiles" },
  { to: "/settings/audit", label: "Audit" },
  { to: "/settings/backup", label: "Backup" },
];

interface SummaryProps {
  ok: number;
  warn: number;
  crit: number;
  total: number;
  fetchedAt: number;
}

function fmtRelative(ms: number, now: number): string {
  if (!ms) return "—";
  const diff = Math.max(0, now - ms);
  if (diff < 1500) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

function StatusSummary({ ok, warn, crit, total, fetchedAt }: SummaryProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-s-3 rounded-r-pill border border-[var(--hairline)] bg-[var(--surface-1)] px-s-3 py-s-1 font-mono tabular-nums text-fs-label">
      <span className="flex items-center gap-s-1 text-[var(--ok)]">
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--ok)]"
          aria-hidden
        />
        {ok}
      </span>
      <span className="flex items-center gap-s-1 text-[var(--warn)]">
        <span
          className="inline-block h-1.5 w-1.5 rotate-45 bg-[var(--warn)]"
          aria-hidden
        />
        {warn}
      </span>
      <span className="flex items-center gap-s-1 text-[var(--crit)]">
        <span
          className="inline-block h-1.5 w-1.5 bg-[var(--crit)]"
          aria-hidden
        />
        {crit}
      </span>
      <span className="hidden text-[var(--text-lo)] sm:inline">of {total}</span>
      <span aria-hidden className="hidden text-[var(--text-dim)] sm:inline">
        ·
      </span>
      <span className="hidden text-[var(--text-lo)] sm:inline">
        {fmtRelative(fetchedAt, now)}
      </span>
    </div>
  );
}

export interface TopNavProps {
  onAddService?: () => void;
}

export function TopNav({ onAddService }: TopNavProps) {
  const { data: agg } = useAggregatedHealth();
  const { data: metrics } = useBackendMetrics();
  const ws = useWebSocketContext();

  const counts = (() => {
    if (!agg) return { ok: 0, warn: 0, crit: 0, total: 0 };
    let ok = 0;
    let warn = 0;
    let crit = 0;
    for (const e of agg.entries) {
      if (!e.result.ok) {
        crit += 1;
        continue;
      }
      const snap = e.result.value;
      if (snap.reachable) {
        const hostDown = snap.host && snap.host.reachable === false;
        const serviceDown = snap.service && snap.service.reachable === false;
        if (hostDown || serviceDown) warn += 1;
        else ok += 1;
      } else {
        crit += 1;
      }
    }
    return { ok, warn, crit, total: agg.entries.length };
  })();

  const breakers = summarizeBreakers(metrics?.breakers);

  return (
    <header className="glass-topbar sticky top-0 z-40">
      <div className="mx-auto flex max-w-screen-2xl items-center gap-s-6 px-s-8 py-s-4">
        <div className="flex items-baseline gap-s-3">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full bg-[var(--accent)] shadow-[0_0_12px_var(--accent)]"
          />
          <span className="font-[600] tracking-[-0.02em] text-fs-h3 text-[var(--text-hi)]">
            Watchman
          </span>
          <span className="hidden text-fs-label uppercase tracking-[0.18em] text-[var(--text-dim)] md:inline">
            Bento
          </span>
        </div>

        <nav className="ml-s-4 hidden items-center gap-s-1 md:flex">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "rounded-r-2 px-s-3 py-s-1 text-fs-label uppercase tracking-[0.06em] transition-colors",
                  isActive
                    ? "bg-[var(--accent-soft)] text-[var(--text-hi)] shadow-[inset_0_0_0_1px_oklch(80%_0.13_85_/_0.25)]"
                    : "text-[var(--text-md)] hover:bg-[var(--surface-2)] hover:text-[var(--text-hi)]"
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-s-3">
          <ProfileSwitcher />

          <StatusSummary
            ok={counts.ok}
            warn={counts.warn}
            crit={counts.crit}
            total={counts.total}
            fetchedAt={agg?.fetchedAt ?? 0}
          />

          {breakers.open + breakers.halfOpen > 0 ? (
            <span
              title={`${breakers.open} open, ${breakers.halfOpen} half-open`}
              className="hidden items-center gap-s-1 rounded-r-pill border border-[var(--warn)] bg-[var(--warn-soft)] px-s-2 py-s-1 font-mono text-fs-label text-[var(--warn)] md:flex"
            >
              ⚠ {breakers.open + breakers.halfOpen} breaker
              {breakers.open + breakers.halfOpen === 1 ? "" : "s"}
            </span>
          ) : null}

          <span
            title={
              ws.isConnected ? "WebSocket connected" : "WebSocket disconnected"
            }
            aria-label={
              ws.isConnected ? "WebSocket connected" : "WebSocket disconnected"
            }
            className={cn(
              "hidden h-2 w-2 rounded-full md:inline-block",
              ws.isConnected
                ? "bg-[var(--ok)] shadow-[0_0_8px_var(--ok)]"
                : "bg-[var(--text-dim)]"
            )}
          />

          {onAddService ? (
            <Button variant="accent" size="sm" onClick={onAddService}>
              + Add service
            </Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
