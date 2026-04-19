import { useMemo, useState, useCallback } from "react";
import { HistoryChart } from "./HistoryChart";
import { RangePicker } from "./RangePicker";
import { EventLog, type ServiceEvent } from "./EventLog";
import { useWebSocketEvent } from "@/hooks/useWebSocketEvent";
import type { HistoryRange } from "@/hooks/useServiceHistory";
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
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  MetricValue,
} from "@/components/primitives";
import { useServiceHealth, useServiceStats } from "@/hooks/useServiceHealth";
import { getRenderer, dotGet } from "@/services/renderers";
import type { ServiceKind, Tone } from "@/services/renderers/types";

const TONE_TO_STATUS: Record<Tone, "neutral" | "ok" | "warn" | "crit"> = {
  neutral: "neutral",
  ok: "ok",
  warn: "warn",
  crit: "crit",
};

export interface ServiceDetailSheetProps {
  kind: ServiceKind | undefined;
  instanceId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ServiceDetailSheet({
  kind,
  instanceId,
  open,
  onOpenChange,
}: ServiceDetailSheetProps) {
  const serviceKey = instanceId ?? kind ?? "";
  const healthQuery = useServiceHealth(serviceKey, { enabled: !!kind });
  const statsQuery = useServiceStats(serviceKey, !!kind);

  const renderer = kind ? getRenderer(kind) : undefined;
  const stats = statsQuery.data as Record<string, unknown> | undefined;
  const health = healthQuery.data as
    | { status: "online" | "offline" | "warning" | "loading"; error?: string }
    | undefined;

  const tone = useMemo<Tone>(() => {
    if (!renderer) return "neutral";
    try {
      return renderer.tone({ stats, health });
    } catch {
      return "neutral";
    }
  }, [renderer, stats, health]);

  const [range, setRange] = useState<HistoryRange>("24h");
  const [events, setEvents] = useState<ServiceEvent[]>([]);

  const handleWsEvent = useCallback(
    (ev: WsEvent) => {
      if (!kind) return;
      if (ev.service && ev.service !== serviceKey && ev.service !== kind) return;
      if (ev.type !== "alert") return;
      const level: ServiceEvent["level"] =
        ev.level === "error" ? "error" : ev.level === "warning" ? "warn" : "info";
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
  const primaryValue = primary
    ? primary.format(dotGet(stats, primary.key))
    : "—";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent aria-describedby={undefined}>
        {renderer ? (
          <>
            <SheetHeader>
              <div className="flex items-center gap-s-3">
                <StatusDot tone={TONE_TO_STATUS[tone]} pulse={tone === "ok"} />
                <SheetTitle>{renderer.displayName}</SheetTitle>
                {health?.status ? (
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
                    {health.status}
                  </Badge>
                ) : null}
              </div>
            </SheetHeader>

            <SheetBody>
              {primary ? (
                <div className="mb-s-6">
                  <div className="text-fs-label uppercase tracking-[0.06em] text-[var(--text-lo)]">
                    {primary.label}
                  </div>
                  <MetricValue size="xl" value={primaryValue} />
                </div>
              ) : null}

              <Tabs defaultValue="metrics" className="w-full">
                <TabsList>
                  <TabsTrigger value="metrics">Metrics</TabsTrigger>
                  <TabsTrigger value="charts">Charts</TabsTrigger>
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
                              {m.format(dotGet(stats, m.key))}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                  ))}
                </TabsContent>

                <TabsContent value="charts" className="pt-s-4 space-y-s-3">
                  {renderer.charts.length === 0 ? (
                    <p className="text-fs-body text-[var(--text-md)]">
                      No charts configured.
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between">
                        <span className="text-fs-label uppercase tracking-[0.06em] text-[var(--text-lo)]">
                          Range
                        </span>
                        <RangePicker value={range} onChange={setRange} />
                      </div>
                      <ul className="space-y-s-3">
                        {renderer.charts.map((c) => (
                          <li
                            key={c.metric}
                            className="rounded-r-2 border border-[var(--hairline)] p-s-3"
                          >
                            <div className="flex items-baseline justify-between">
                              <span className="text-fs-label text-[var(--text-lo)]">
                                {c.label}
                              </span>
                              <span className="font-mono tabular-nums text-fs-body text-[var(--text-hi)]">
                                {c.format(dotGet(stats, c.metric))}
                              </span>
                            </div>
                            {kind ? (
                              <HistoryChart
                                kind={kind}
                                instance={instanceId}
                                spec={c}
                                range={range}
                                tone={tone}
                              />
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="events" className="pt-s-4">
                  <EventLog
                    events={events}
                    emptyLabel="No live events yet."
                  />
                </TabsContent>
              </Tabs>
            </SheetBody>

            <SheetFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Close
              </Button>
            </SheetFooter>
          </>
        ) : (
          <SheetBody>
            <p className="text-fs-body text-[var(--text-md)]">
              No renderer for this service.
            </p>
          </SheetBody>
        )}
      </SheetContent>
    </Sheet>
  );
}
