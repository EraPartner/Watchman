import { useMemo, useState, useCallback, useEffect } from "react";
import { EventLog, type ServiceEvent } from "./EventLog";
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
} from "@/components/primitives";
import { useServiceHealth, useServiceStats } from "@/hooks/useServiceHealth";
import {
  useServices,
  useUpdateService,
  useDeleteService,
} from "@/pages/Settings/useConfigQueries";
import ServiceEditor from "@/pages/Settings/ServiceEditor";
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

type View = "detail" | "edit";

export function ServiceDetailSheet({
  kind,
  instanceId,
  open,
  onOpenChange,
}: ServiceDetailSheetProps) {
  const healthQuery = useServiceHealth(kind ?? "", instanceId, {
    enabled: !!kind,
  });
  const statsQuery = useServiceStats(kind ?? "", instanceId, !!kind);
  const { data: allServices } = useServices();
  const updateMut = useUpdateService();
  const deleteMut = useDeleteService();

  const service = useMemo(
    () =>
      allServices?.find(
        (s) =>
          s.kind === kind &&
          (instanceId ? s.instanceId === instanceId : s.instanceId === "main")
      ),
    [allServices, kind, instanceId]
  );

  const renderer = kind ? getRenderer(kind) : undefined;
  const statsSnapshot = statsQuery.data as
    | { metrics?: Record<string, unknown> }
    | undefined;
  const stats = statsSnapshot?.metrics as Record<string, unknown> | undefined;
  const healthRaw = healthQuery.data as
    | { reachable?: boolean; message?: string }
    | undefined;
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

  const tone = useMemo<Tone>(() => {
    if (!renderer) return "neutral";
    try {
      return renderer.tone({ stats, health });
    } catch {
      return "neutral";
    }
  }, [renderer, stats, health]);

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
                {service && !service.enabled ? (
                  <Badge tone="mono">disabled</Badge>
                ) : null}
              </div>
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
                    <Button
                      variant="ghost"
                      onClick={() => setView("edit")}
                    >
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
