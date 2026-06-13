import { useMemo, useState, useCallback, useEffect } from "react";
import { ExternalLink, Check, X } from "lucide-react";
import { EventLog, type ServiceEvent } from "./EventLog";
import { ChartsPanel } from "./ChartsPanel";
import { RawStatsPanel } from "./RawStatsPanel";
import { ConfigPanel } from "./ConfigPanel";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import type { WsEvent } from "@/lib/wsEventBus";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetBody,
  SheetFooter,
  SheetTitle,
  StatusDot,
  Badge,
  Button,
  ConfirmDialog,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  MetricValue,
  Sparkline,
} from "@/components/primitives";
import { useMetricSeries } from "@/lib/metricHistory";
import { serviceIcon, heroState } from "@/lib/serviceVisuals";
import { useServiceHealth, useServiceStats } from "@/hooks/useServiceHealth";
import {
  useServices,
  useUpdateService,
  useDeleteService,
} from "@/pages/Settings/useConfigQueries";
import ServiceEditor from "@/pages/Settings/ServiceEditor";
import {
  dotGet,
  getRenderer,
  rendererTrackedMetrics,
} from "@/services/renderers";
import type { ServiceKind, Tone } from "@/services/renderers/types";

const TONE_TO_STATUS: Record<Tone, "neutral" | "ok" | "warn" | "crit"> = {
  neutral: "neutral",
  ok: "ok",
  warn: "warn",
  crit: "crit",
};

function fmtMs(ms?: number): string | undefined {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return undefined;
  if (ms < 1) return "<1 ms";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export interface ServiceDetailSheetProps {
  kind: ServiceKind | undefined;
  instanceId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type View = "detail" | "edit";

export function ServiceDetailSheet({
  kind,
  instanceId,
  open,
  onOpenChange,
}: ServiceDetailSheetProps) {
  const renderer = kind ? getRenderer(kind) : undefined;
  const trackedMetrics = useMemo(
    () => rendererTrackedMetrics(renderer),
    [renderer]
  );

  const health = useServiceHealth(kind ?? "", instanceId);
  const stats = useServiceStats(kind ?? "", instanceId, !!kind, trackedMetrics);
  const { data: allServices } = useServices();
  const updateMut = useUpdateService();
  const deleteMut = useDeleteService();

  const service = useMemo(
    () =>
      Array.isArray(allServices)
        ? allServices.find(
            (s) =>
              s.kind === kind &&
              (instanceId
                ? s.instanceId === instanceId
                : s.instanceId === "main")
          )
        : undefined,
    [allServices, kind, instanceId]
  );

  const statsSnapshot = stats.data;
  const statsMetrics = statsSnapshot?.metrics as
    | Record<string, unknown>
    | undefined;

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

  const tone = useMemo<Tone>(() => {
    if (!renderer) return "neutral";
    try {
      return renderer.tone({ stats: statsMetrics, health: healthShape });
    } catch {
      return "neutral";
    }
  }, [renderer, statsMetrics, healthShape]);

  const [events, setEvents] = useState<ServiceEvent[]>([]);
  const [view, setView] = useState<View>("detail");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const serviceKey = instanceId ?? kind ?? "";

  useEffect(() => {
    if (!open) {
      setView("detail");
      setConfirmDelete(false);
    }
  }, [open]);

  const handleWsEvent = useCallback(
    (ev: WsEvent) => {
      if (!kind) return;
      if (ev.service && ev.service !== serviceKey && ev.service !== kind)
        return;
      if (ev.type !== "alert") return;
      const level: ServiceEvent["level"] =
        ev.level === "error"
          ? "error"
          : ev.level === "warning"
            ? "warn"
            : "info";
      const next: ServiceEvent = {
        id: `${ev.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
        ts: Date.parse(ev.timestamp) || Date.now(),
        serviceKey,
        level,
        message: ev.message ?? "Service event",
      };
      setEvents((prev) => [next, ...prev].slice(0, 50));
    },
    [kind, serviceKey]
  );
  useWebSocketEvent("alert", handleWsEvent);

  const primary = renderer?.summary[0];
  const primaryRaw = primary
    ? primary.source === "health"
      ? dotGet(healthRaw, primary.key)
      : dotGet(statsMetrics, primary.key)
    : undefined;
  const primaryValue = primary ? primary.format(primaryRaw) : "—";

  const heroSeries = useMetricSeries(
    kind ?? "",
    instanceId,
    primary?.key ?? ""
  );
  const heroData = useMemo(() => heroSeries.map((s) => s.v), [heroSeries]);
  const HeroIcon = serviceIcon(kind);
  const { isBool: heroIsBool, truthy: heroTruthy } = heroState(
    primary ? primaryValue : undefined
  );
  const accentColor =
    tone === "crit"
      ? "var(--crit)"
      : tone === "warn"
        ? "var(--warn)"
        : "var(--accent)";
  const sparkTone =
    tone === "neutral" ? "neutral" : tone === "ok" ? "accent" : tone;

  const handleToggleEnabled = () => {
    if (!service) return;
    updateMut.mutate({
      id: service.id,
      input: { enabled: !service.enabled },
    });
  };

  const handleDelete = async () => {
    if (!service) return;
    await deleteMut.mutateAsync(service.id);
    setConfirmDelete(false);
    onOpenChange(false);
  };

  const quickLinkUrl =
    renderer?.quickLink && service
      ? renderer.quickLink({
          config: service.config as Record<string, unknown>,
        })
      : undefined;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-describedby={undefined}>
        {renderer ? (
          <>
            <SheetHeader>
              <div className="flex items-center gap-s-3">
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
                  <StatusDot
                    tone={TONE_TO_STATUS[tone]}
                    pulse={tone === "ok"}
                  />
                )}
                <SheetTitle>{renderer.displayName}</SheetTitle>
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
                {service && !service.enabled ? (
                  <Badge tone="mono">disabled</Badge>
                ) : null}
                {quickLinkUrl ? (
                  <a
                    href={quickLinkUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="ml-auto inline-flex items-center gap-s-1 rounded-r-2 px-s-2 py-s-1 text-fs-label text-[var(--text-md)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text-hi)]"
                  >
                    <ExternalLink size={12} aria-hidden />
                    {renderer.quickLinkLabel ?? "Open"}
                  </a>
                ) : null}
              </div>

              {hasTwoTiers ? (
                <div className="mt-s-2 flex flex-wrap gap-s-3 font-mono tabular-nums text-fs-label text-[var(--text-lo)]">
                  {fmtMs(hostHealth.pingMs) ? (
                    <span>
                      host ping{" "}
                      <span className="text-[var(--text-md)]">
                        {fmtMs(hostHealth.pingMs)}
                      </span>
                    </span>
                  ) : null}
                  {fmtMs(serviceHealth.latencyMs) ? (
                    <span>
                      service latency{" "}
                      <span className="text-[var(--text-md)]">
                        {fmtMs(serviceHealth.latencyMs)}
                      </span>
                    </span>
                  ) : null}
                  {serviceHealth.message ? (
                    <span className="text-[var(--warn)]">
                      {serviceHealth.message}
                    </span>
                  ) : null}
                </div>
              ) : healthShape?.error ? (
                <div className="mt-s-2 text-fs-label text-[var(--crit)]">
                  {healthShape.error}
                </div>
              ) : null}
            </SheetHeader>

            <SheetBody>
              {view === "edit" && service ? (
                <ServiceEditor
                  existing={service}
                  submitting={updateMut.isPending}
                  onCancel={() => setView("detail")}
                  onSubmit={async (input) => {
                    await updateMut.mutateAsync({
                      id: service.id,
                      input,
                    });
                    setView("detail");
                  }}
                />
              ) : (
                <>
                  {primary ? (
                    <div className="glass-regular relative mb-s-6 overflow-hidden rounded-r-3 p-s-5">
                      <HeroIcon
                        aria-hidden
                        size={148}
                        strokeWidth={1}
                        className="pointer-events-none absolute -right-6 -top-6 z-0 text-[var(--text-hi)] opacity-[0.05]"
                      />
                      {heroData.length >= 2 ? (
                        <div
                          aria-hidden
                          className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-20 opacity-60 [mask-image:linear-gradient(to_top,black_55%,transparent)]"
                        >
                          <Sparkline
                            data={heroData}
                            stretch
                            height={80}
                            tone={sparkTone}
                            className="h-full w-full"
                          />
                        </div>
                      ) : null}
                      <div className="relative z-[1]">
                        <div className="text-fs-label uppercase tracking-[0.08em] text-[var(--text-lo)]">
                          {primary.label}
                        </div>
                        <div className="mt-s-2">
                          {heroIsBool ? (
                            <div className="flex items-center gap-s-2">
                              <span
                                className="inline-flex h-8 w-8 items-center justify-center rounded-full"
                                style={{
                                  color: heroTruthy
                                    ? accentColor
                                    : "var(--crit)",
                                  background: heroTruthy
                                    ? "var(--accent-soft)"
                                    : "var(--crit-soft)",
                                }}
                              >
                                {heroTruthy ? (
                                  <Check size={18} strokeWidth={3} />
                                ) : (
                                  <X size={18} strokeWidth={3} />
                                )}
                              </span>
                              <span
                                className="font-mono text-fs-h1 font-[700] uppercase tracking-[0.01em]"
                                style={{
                                  color: heroTruthy
                                    ? "var(--text-hi)"
                                    : "var(--crit)",
                                }}
                              >
                                {primary.label}
                              </span>
                            </div>
                          ) : (
                            <MetricValue
                              size="xl"
                              value={primaryValue}
                              unit={primary.unit}
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <Tabs defaultValue="metrics" className="w-full">
                    <TabsList>
                      <TabsTrigger value="metrics">Metrics</TabsTrigger>
                      <TabsTrigger value="charts">Charts</TabsTrigger>
                      {renderer.customPanel ? (
                        <TabsTrigger value="custom">
                          {renderer.customPanelLabel ?? "Service"}
                        </TabsTrigger>
                      ) : null}
                      <TabsTrigger value="raw">Raw</TabsTrigger>
                      <TabsTrigger value="config">Config</TabsTrigger>
                      <TabsTrigger value="events">Events</TabsTrigger>
                    </TabsList>

                    <TabsContent value="metrics" className="pt-s-4 space-y-s-6">
                      {renderer.detail.map((group) => (
                        <section key={group.title} className="space-y-s-2">
                          <h3 className="text-fs-label font-[600] uppercase tracking-[0.06em] text-[var(--text-lo)]">
                            {group.title}
                          </h3>
                          <dl className="grid grid-cols-2 gap-x-s-4 gap-y-s-2 text-fs-body">
                            {group.metrics.map((m) => (
                              <div key={m.key} className="min-w-0">
                                <dt className="truncate text-fs-label text-[var(--text-lo)]">
                                  {m.label}
                                </dt>
                                <dd className="truncate font-mono tabular-nums text-[var(--text-hi)]">
                                  {m.format(dotGet(statsMetrics, m.key))}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </section>
                      ))}
                    </TabsContent>

                    <TabsContent value="charts" className="pt-s-4">
                      <ChartsPanel
                        kind={renderer.kind}
                        instanceId={instanceId}
                        charts={renderer.charts}
                        tone={tone}
                      />
                    </TabsContent>

                    {renderer.customPanel ? (
                      <TabsContent value="custom" className="pt-s-4">
                        {renderer.customPanel({
                          stats: statsMetrics,
                          health: healthShape,
                        })}
                      </TabsContent>
                    ) : null}

                    <TabsContent value="raw" className="pt-s-4">
                      <RawStatsPanel renderer={renderer} stats={statsMetrics} />
                    </TabsContent>

                    <TabsContent value="config" className="pt-s-4">
                      <ConfigPanel service={service} />
                    </TabsContent>

                    <TabsContent value="events" className="pt-s-4">
                      <EventLog
                        events={events}
                        emptyLabel="No live events yet."
                      />
                    </TabsContent>
                  </Tabs>
                </>
              )}
            </SheetBody>

            {view === "detail" ? (
              <SheetFooter>
                {service ? (
                  <>
                    <Button
                      variant="ghost"
                      onClick={handleToggleEnabled}
                      disabled={updateMut.isPending}
                    >
                      {service.enabled ? "Disable" : "Enable"}
                    </Button>
                    <Button variant="ghost" onClick={() => setView("edit")}>
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => setConfirmDelete(true)}
                      className="text-[var(--crit)] hover:text-[var(--crit)] hover:brightness-110"
                    >
                      Delete
                    </Button>
                  </>
                ) : null}
                <Button variant="tonal" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
              </SheetFooter>
            ) : null}
          </>
        ) : (
          <SheetBody>
            <p className="text-fs-body text-[var(--text-md)]">
              No renderer for this service.
            </p>
          </SheetBody>
        )}
      </SheetContent>
      {service ? (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title={`Delete ${service.kind}/${service.instanceId}?`}
          description="This removes the service and stops polling. Cannot be undone without re-adding."
          destructive
          pending={deleteMut.isPending}
          onConfirm={handleDelete}
        />
      ) : null}
    </Sheet>
  );
}
