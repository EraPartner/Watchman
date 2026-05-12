import { useMemo, type KeyboardEvent, type MouseEvent } from "react";
import { ExternalLink } from "lucide-react";
import { Surface } from "@/components/primitives/Surface";
import { StatusDot } from "@/components/primitives/StatusDot";
import { MetricValue } from "@/components/primitives/MetricValue";
import { Badge } from "@/components/primitives/Badge";
import { Skeleton } from "@/components/primitives/Skeleton";
import { Sparkline } from "@/components/primitives/Sparkline";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/primitives/Tooltip";
import { cn } from "@/lib/utils";
import { useServiceHealth, useServiceStats, StatsApiError } from "@/hooks/useServiceHealth";
import { useServices } from "@/pages/Settings/useConfigQueries";
import type { ServiceInstance } from "@/hooks/useServiceInstances";
import { getRenderer, rendererTrackedMetrics } from "@/services/renderers";
import type {
  ServiceKind,
  ServiceRenderer,
  Tone,
} from "@/services/renderers/types";
import { dotGet } from "@/services/renderers/formatters";
import { useMetricSeries } from "@/lib/metricHistory";
import { tileVariants, type TileDensity, type TileSize } from "./tileVariants";

const TONE_TO_STATUS: Record<Tone, "neutral" | "ok" | "warn" | "crit"> = {
  neutral: "neutral",
  ok: "ok",
  warn: "warn",
  crit: "crit",
};

const SPARKLINE_TONE: Record<Tone, "neutral" | "ok" | "warn" | "crit" | "accent"> = {
  neutral: "neutral",
  ok: "accent",
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

function fmtMs(ms?: number): string | undefined {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return undefined;
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

interface StatsErrorBadge {
  label: string;
  title: string;
}

const NEEDS_CONFIG_CODES = new Set(["UNAUTHORIZED", "VALIDATION"]);

function computeStatsErrorBadge(
  error: unknown,
  data: unknown
): StatsErrorBadge | undefined {
  if (!error || data !== undefined) return undefined;
  const code = error instanceof StatsApiError ? error.code : undefined;
  const message = error instanceof Error ? error.message : String(error);
  const needsConfig =
    (code !== undefined && NEEDS_CONFIG_CODES.has(code)) ||
    /credentials?/i.test(message);
  return {
    label: needsConfig ? "needs config" : "stats unavailable",
    title: message,
  };
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

  const { data: services } = useServices();
  const configuredService = useMemo(
    () =>
      Array.isArray(services)
        ? services.find(
            (s) => s.kind === kind && s.instanceId === (instanceId ?? "main")
          )
        : undefined,
    [services, kind, instanceId]
  );

  const health = useServiceHealth(kind, instanceId);
  const trackedMetrics = useMemo(
    () => rendererTrackedMetrics(renderer),
    [renderer]
  );
  const stats = useServiceStats(kind, instanceId, true, trackedMetrics);

  const healthRaw = health.data;
  const hostHealth = healthRaw?.host;
  const serviceHealth = healthRaw?.service;
  const hasTwoTiers = hostHealth !== undefined && serviceHealth !== undefined;

  const healthShape = useMemo(
    () =>
      healthRaw
        ? {
            status: (healthRaw.reachable ? "online" : "offline") as
              | "online"
              | "offline"
              | "warning"
              | "loading",
            error: healthRaw.message,
          }
        : undefined,
    [healthRaw]
  );

  const statsSnapshot = stats.data;
  const statsMetrics = statsSnapshot?.metrics as
    | Record<string, unknown>
    | undefined;

  const tone = useMemo<Tone>(() => {
    if (!renderer) return "neutral";
    try {
      return renderer.tone({ stats: statsMetrics, health: healthShape, instance });
    } catch {
      return "neutral";
    }
  }, [renderer, statsMetrics, healthShape, instance]);

  const primary = renderer?.summary[0];
  const sparkSeries = useMetricSeries(kind, instanceId, primary?.key ?? "");
  const sparkData = useMemo(() => sparkSeries.map((s) => s.v), [sparkSeries]);

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

  const secondary = renderer.summary.slice(1, 3);
  const primaryValue = primary
    ? primary.format(dotGet(statsMetrics, primary.key))
    : "—";
  const subtitle =
    renderer.subtitle?.({ stats: statsMetrics, health: healthShape, instance }) ??
    null;
  const surfaceTone = tone === "ok" ? "neutral" : tone;

  const quickLinkUrl =
    renderer.quickLink && configuredService
      ? renderer.quickLink({
          instance,
          config: configuredService.config as Record<string, unknown>,
        })
      : undefined;

  const offline =
    healthShape?.status === "offline" || (!!health.error && !healthRaw);
  const offlineMessage =
    healthShape?.error ?? health.error?.message ?? "Service unavailable";

  const statsErrorBadge = computeStatsErrorBadge(stats.error, stats.data);

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

  const handleQuickLink = (e: MouseEvent<HTMLAnchorElement>) => {
    e.stopPropagation();
  };

  const loading = stats.isLoading && !statsMetrics;
  const showSparkline = size !== "S" && sparkData.length >= 2 && !offline;

  return (
    <Surface
      tone={surfaceTone}
      padding="md"
      elevation={1}
      className={cn(
        tileVariants({ size, density, interactive: !!onOpenDetail }),
        "group",
        "transition-shadow hover:shadow-elev-2",
        className
      )}
      role={onOpenDetail ? "button" : undefined}
      tabIndex={onOpenDetail ? 0 : undefined}
      aria-label={`${renderer.displayName} tile`}
      onClick={onOpenDetail ? handleOpen : undefined}
      onKeyDown={onOpenDetail ? handleKey : undefined}
    >
      <header className="flex items-start justify-between gap-s-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-s-2">
            {hasTwoTiers ? (
              <>
                <StatusDot
                  tone={hostHealth.reachable ? "ok" : "crit"}
                  pulse={hostHealth.reachable}
                  label={`host: ${hostHealth.reachable ? "up" : "down"}${
                    hostHealth.pingMs !== undefined ? ` (${fmtMs(hostHealth.pingMs)})` : ""
                  }`}
                />
                <StatusDot
                  tone={serviceHealth.reachable ? "ok" : "crit"}
                  pulse={serviceHealth.reachable}
                  label={`service: ${serviceHealth.reachable ? "up" : "down"}${
                    serviceHealth.latencyMs !== undefined ? ` (${fmtMs(serviceHealth.latencyMs)})` : ""
                  }`}
                />
              </>
            ) : (
              <StatusDot tone={TONE_TO_STATUS[tone]} pulse={tone === "ok"} />
            )}
            <span className="truncate text-fs-label font-[600] uppercase tracking-[0.06em] text-[var(--text-md)]">
              {renderer.displayName}
            </span>
            {hasTwoTiers ? (
              <span className="hidden sm:inline-flex items-baseline gap-s-1 text-fs-label font-mono tabular-nums text-[var(--text-lo)]">
                {fmtMs(hostHealth.pingMs) ? (
                  <span title="host ping">{fmtMs(hostHealth.pingMs)}</span>
                ) : null}
                {fmtMs(hostHealth.pingMs) && fmtMs(serviceHealth.latencyMs) ? (
                  <span aria-hidden>·</span>
                ) : null}
                {fmtMs(serviceHealth.latencyMs) ? (
                  <span title="service latency">
                    {fmtMs(serviceHealth.latencyMs)}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
          {subtitle ? (
            <div className="mt-s-1 truncate text-fs-label text-[var(--text-lo)]">
              {subtitle}
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-s-2">
          {quickLinkUrl ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={quickLinkUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  onClick={handleQuickLink}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-r-2 text-[var(--text-lo)] opacity-0 transition-[opacity,color,background-color] duration-fast group-hover:opacity-100 group-focus-within:opacity-100 hover:bg-[var(--surface-2)] hover:text-[var(--text-hi)] focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
                  aria-label={renderer.quickLinkLabel ?? "Open service UI"}
                >
                  <ExternalLink size={12} aria-hidden />
                </a>
              </TooltipTrigger>
              <TooltipContent>
                {renderer.quickLinkLabel ?? "Open"}
              </TooltipContent>
            </Tooltip>
          ) : null}
          {healthShape?.status ? (
            <Badge
              tone={
                tone === "ok"
                  ? "ok"
                  : tone === "warn"
                    ? "warn"
                    : tone === "crit"
                      ? "crit"
                      : "mono"
              }
            >
              {healthShape.status}
            </Badge>
          ) : null}
          {statsErrorBadge && !offline ? (
            <Badge tone="warn" title={statsErrorBadge.title}>
              {statsErrorBadge.label}
            </Badge>
          ) : null}
        </div>
      </header>

      <div className="flex flex-1 flex-col justify-end gap-s-2">
        {offline ? (
          <div className="text-fs-label text-[var(--text-md)]">
            <p className="text-[var(--crit)] font-mono uppercase tracking-[0.06em]">
              Unavailable
            </p>
            <p className="mt-s-1 line-clamp-2 text-[var(--text-lo)]">
              {offlineMessage}
            </p>
          </div>
        ) : statsErrorBadge ? (
          <p className="text-fs-label text-[var(--text-lo)]">
            configure to see metrics
          </p>
        ) : (
          <>
            {loading ? (
              <Skeleton height={40} className="w-3/5" />
            ) : primary ? (
              <div className="flex items-end justify-between gap-s-3">
                <MetricValue
                  size={size === "S" ? "md" : size === "XL" ? "xl" : "lg"}
                  value={primaryValue}
                  unit={primary.label.toLowerCase()}
                />
                {showSparkline ? (
                  <Sparkline
                    data={sparkData}
                    width={size === "XL" ? 160 : size === "L" ? 120 : 88}
                    height={size === "XL" ? 40 : 32}
                    tone={SPARKLINE_TONE[tone]}
                    className="shrink-0"
                  />
                ) : null}
              </div>
            ) : null}

            {secondary.length > 0 ? (
              <dl className="grid grid-cols-2 gap-s-2 text-fs-label">
                {secondary.map((m) => (
                  <div key={m.key} className="min-w-0">
                    <dt className="truncate text-[var(--text-lo)]">{m.label}</dt>
                    <dd className="truncate font-mono tabular-nums text-[var(--text-hi)]">
                      {m.format(dotGet(statsMetrics, m.key))}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </>
        )}
      </div>
    </Surface>
  );
}

ServiceTile.displayName = "ServiceTile";
