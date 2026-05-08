import { useMemo, type KeyboardEvent } from "react";
import { Surface } from "@/components/primitives/Surface";
import { StatusDot } from "@/components/primitives/StatusDot";
import { MetricValue } from "@/components/primitives/MetricValue";
import { Badge } from "@/components/primitives/Badge";
import { Skeleton } from "@/components/primitives/Skeleton";
import { cn } from "@/lib/utils";
import { useServiceHealth, useServiceStats } from "@/hooks/useServiceHealth";
import type { ServiceInstance } from "@/hooks/useServiceInstances";
import { getRenderer } from "@/services/renderers";
import type {
  ServiceKind,
  ServiceRenderer,
  Tone,
} from "@/services/renderers/types";
import { dotGet } from "@/services/renderers/formatters";
import { tileVariants, type TileDensity, type TileSize } from "./tileVariants";

const TONE_TO_STATUS: Record<Tone, "neutral" | "ok" | "warn" | "crit"> = {
  neutral: "neutral",
  ok: "ok",
  warn: "warn",
  crit: "crit",
};

export interface ServiceTileProps {
  kind: ServiceKind;
  instanceId?: string;
  instance?: ServiceInstance;
  size?: TileSize;
  density?: TileDensity;
  onOpenDetail?: (ctx: {
    kind: ServiceKind;
    instanceId?: string;
    renderer: ServiceRenderer;
  }) => void;
  className?: string;
}

export function ServiceTile({
  kind,
  instanceId,
  instance,
  size = "M",
  density = "comfortable",
  onOpenDetail,
  className,
}: ServiceTileProps) {
  const renderer = getRenderer(kind);

  const healthQuery = useServiceHealth(kind, instanceId);
  const statsQuery = useServiceStats(kind, instanceId);

  const loading = healthQuery.isLoading || statsQuery.isLoading;
  const healthRaw = healthQuery.data as
    | {
        reachable?: boolean;
        message?: string;
        host?: { reachable: boolean; pingMs?: number };
        service?: { reachable: boolean; latencyMs?: number };
      }
    | undefined;
  const hostHealth = healthRaw?.host;
  const serviceHealth = healthRaw?.service;
  const hasTwoTiers = hostHealth !== undefined && serviceHealth !== undefined;
  const health = healthRaw
    ? {
        status: (healthRaw.reachable ? "online" : "offline") as
          | "online"
          | "offline"
          | "warning"
          | "loading",
        error: healthRaw.message,
      }
    : undefined;
  const statsSnapshot = statsQuery.data as
    | { metrics?: Record<string, unknown> }
    | undefined;
  const stats = statsSnapshot?.metrics as Record<string, unknown> | undefined;

  const tone = useMemo<Tone>(() => {
    if (!renderer) return "neutral";
    try {
      return renderer.tone({ stats, health, instance });
    } catch {
      return "neutral";
    }
  }, [renderer, stats, health, instance]);

  if (!renderer) {
    return (
      <Surface
        className={cn(tileVariants({ size, density, interactive: false }), className)}
        padding="md"
      >
        <div className="text-fs-label text-[var(--text-lo)]">
          Unknown service: {kind}
        </div>
      </Surface>
    );
  }

  const primary = renderer.summary[0];
  const secondary = renderer.summary.slice(1, 3);
  const primaryValue = primary ? primary.format(dotGet(stats, primary.key)) : "—";
  const subtitle = renderer.subtitle?.({ stats, health, instance }) ?? null;
  const surfaceTone = tone === "ok" ? "neutral" : tone;

  const handleOpen = () => {
    if (!onOpenDetail) return;
    onOpenDetail({ kind, instanceId, renderer });
  };

  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!onOpenDetail) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleOpen();
    }
  };

  return (
    <Surface
      tone={surfaceTone}
      padding="md"
      elevation={1}
      className={cn(
        tileVariants({ size, density, interactive: !!onOpenDetail }),
        className
      )}
      role={onOpenDetail ? "button" : undefined}
      tabIndex={onOpenDetail ? 0 : undefined}
      aria-label={`${renderer.displayName} tile`}
      onClick={onOpenDetail ? handleOpen : undefined}
      onKeyDown={onOpenDetail ? handleKey : undefined}
    >
      <header className="flex items-start justify-between gap-s-2">
        <div className="min-w-0">
          <div className="flex items-center gap-s-2">
            {hasTwoTiers ? (
              <>
                <StatusDot
                  tone={hostHealth.reachable ? "ok" : "crit"}
                  pulse={hostHealth.reachable}
                  label={`host: ${hostHealth.reachable ? "up" : "down"}`}
                />
                <StatusDot
                  tone={serviceHealth.reachable ? "ok" : "crit"}
                  pulse={serviceHealth.reachable}
                  label={`service: ${serviceHealth.reachable ? "up" : "down"}`}
                />
              </>
            ) : (
              <StatusDot tone={TONE_TO_STATUS[tone]} pulse={tone === "ok"} />
            )}
            <span className="truncate text-fs-label font-[600] uppercase tracking-[0.06em] text-[var(--text-md)]">
              {renderer.displayName}
            </span>
          </div>
          {subtitle ? (
            <div className="mt-s-1 truncate text-fs-label text-[var(--text-lo)]">
              {subtitle}
            </div>
          ) : null}
        </div>
        {health?.status ? (
          <Badge tone={tone === "ok" ? "ok" : tone === "warn" ? "warn" : tone === "crit" ? "crit" : "mono"}>
            {health.status}
          </Badge>
        ) : null}
      </header>

      <div className="flex flex-1 flex-col justify-end gap-s-2">
        {loading && !stats ? (
          <Skeleton height={40} className="w-3/5" />
        ) : primary ? (
          <MetricValue
            size={size === "S" ? "md" : size === "XL" ? "xl" : "lg"}
            value={primaryValue}
            unit={primary.label.toLowerCase()}
          />
        ) : null}

        {secondary.length > 0 ? (
          <dl className="grid grid-cols-2 gap-s-2 text-fs-label">
            {secondary.map((m) => (
              <div key={m.key} className="min-w-0">
                <dt className="truncate text-[var(--text-lo)]">{m.label}</dt>
                <dd className="truncate font-mono tabular-nums text-[var(--text-hi)]">
                  {m.format(dotGet(stats, m.key))}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </Surface>
  );
}

ServiceTile.displayName = "ServiceTile";
