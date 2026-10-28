import { useState } from "react";
import { Link } from "react-router-dom";
import {
  TooltipProvider,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/primitives";
import { buttonVariants } from "@/components/primitives/Button";
import { DashboardGrid } from "./DashboardGrid";
import { TopNav } from "./TopNav";
import { ServiceTile } from "@/components/tile/ServiceTile";
import { ServiceDetailSheet } from "@/components/detail/ServiceDetailSheet";
import { BENTO_LAYOUT } from "@/config/bentoLayout";
import { getRenderer } from "@/services/renderers";
import { useServiceInstances } from "@/hooks/useServiceInstances";
import {
  useAggregatedHealth,
  staleHealthSince,
} from "@/hooks/useAggregatedHealth";
import {
  useCreateService,
  useServices,
} from "@/pages/Settings/useConfigQueries";
import ServiceEditor from "@/pages/Settings/ServiceEditor";
import type { ServiceKind } from "@/services/renderers/types";

interface OpenCtx {
  kind: ServiceKind;
  instanceId?: string;
}

type EditorState = { mode: "closed" } | { mode: "create" };

export default function BentoDashboard() {
  // The last opened tile stays set after close so the sheet keeps its
  // content while the exit animation runs (clearing it flashed "No renderer
  // for this service." as the sheet slid out).
  const [openCtx, setOpenCtx] = useState<OpenCtx | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const { data, isLoading, isError, error, refetch } = useServiceInstances();
  const createMut = useCreateService();
  // /instances lists only what runs in the active profile; the config list
  // tells "nothing configured" apart from "nothing active in this profile".
  const { data: configuredServices } = useServices();
  const configuredCount = Array.isArray(configuredServices)
    ? configuredServices.length
    : 0;
  const aggHealth = useAggregatedHealth();
  const staleSince = staleHealthSince(aggHealth);

  const configuredKinds = data?.instances ?? {};
  const entries = BENTO_LAYOUT.filter(
    (e) => getRenderer(e.kind) && (configuredKinds[e.kind]?.count ?? 0) > 0
  );

  const openCreate = () => setEditor({ mode: "create" });

  return (
    <TooltipProvider>
      <div className="relative min-h-screen text-[var(--text-hi)]">
        <TopNav onAddService={openCreate} />

        <main className="relative z-10 mx-auto max-w-screen-2xl px-s-8 py-s-10">
          <header className="mb-s-10 flex items-end justify-between gap-s-6">
            <div className="space-y-s-3">
              <p className="font-mono text-fs-label uppercase tracking-[0.18em] text-[var(--accent)]">
                home-lab observatory
              </p>
              <h1 className="text-[clamp(2.5rem,2rem+2vw,4rem)] font-[700] leading-[0.95] tracking-[-0.03em] text-[var(--text-hi)]">
                Service dashboard
              </h1>
              <div className="flex items-center gap-s-3">
                <span
                  aria-hidden
                  className="inline-block h-px w-12 bg-[var(--accent)]"
                />
                <p className="font-mono text-fs-label uppercase tracking-[0.06em] text-[var(--text-lo)]">
                  {entries.length} renderer
                  {entries.length === 1 ? "" : "s"} active ·{" "}
                  {Object.values(configuredKinds).reduce(
                    (sum, k) => sum + (k?.count ?? 0),
                    0
                  )}{" "}
                  instance
                  {Object.values(configuredKinds).reduce(
                    (sum, k) => sum + (k?.count ?? 0),
                    0
                  ) === 1
                    ? ""
                    : "s"}
                </p>
              </div>
            </div>
          </header>

          {staleSince !== undefined ? (
            // The health poll keeps its last result on error, so tiles would
            // keep showing "online" with no hint the backend went away.
            <div
              role="alert"
              className="mb-s-6 rounded-r-3 border border-[var(--warn)] bg-[var(--warn-soft)] px-s-4 py-s-3 text-fs-body text-[var(--warn)]"
            >
              Backend unreachable — showing data from{" "}
              {new Date(staleSince).toLocaleTimeString()}
            </div>
          ) : null}

          {isError && !data ? (
            // Without instance data we can't tell "none configured" from
            // "backend unreachable", so don't show the empty state.
            <div
              role="alert"
              className="glass-regular relative overflow-hidden rounded-r-3 p-s-12 text-center"
            >
              <p className="font-mono text-fs-label uppercase tracking-[0.18em] text-[var(--crit)]">
                no signal
              </p>
              <h2 className="mt-s-3 text-fs-h2 font-[600] tracking-[-0.02em] text-[var(--text-hi)]">
                Couldn't load services
              </h2>
              <p className="mt-s-2 text-fs-body text-[var(--text-md)]">
                {error instanceof Error
                  ? error.message
                  : "The backend did not respond."}
              </p>
              <div className="mt-s-6 flex justify-center">
                <Button variant="accent" onClick={() => void refetch()}>
                  Retry
                </Button>
              </div>
            </div>
          ) : !isLoading && entries.length === 0 && configuredCount > 0 ? (
            <div className="glass-regular relative overflow-hidden rounded-r-3 p-s-12 text-center">
              <p className="font-mono text-fs-label uppercase tracking-[0.18em] text-[var(--accent)]">
                quiet observatory
              </p>
              <h2 className="mt-s-3 text-fs-h2 font-[600] tracking-[-0.02em] text-[var(--text-hi)]">
                Nothing active in this profile
              </h2>
              <p className="mt-s-2 text-fs-body text-[var(--text-md)]">
                {configuredCount} service
                {configuredCount === 1 ? " is" : "s are"} configured, but none
                is enabled in the active profile.
              </p>
              <div className="mt-s-6 flex justify-center">
                <Link
                  to="/settings/services"
                  className={buttonVariants({ variant: "accent" })}
                >
                  Open settings
                </Link>
              </div>
            </div>
          ) : !isLoading && entries.length === 0 ? (
            <div className="glass-regular relative overflow-hidden rounded-r-3 p-s-12 text-center">
              <p className="font-mono text-fs-label uppercase tracking-[0.18em] text-[var(--accent)]">
                empty observatory
              </p>
              <h2 className="mt-s-3 text-fs-h2 font-[600] tracking-[-0.02em] text-[var(--text-hi)]">
                No services configured yet
              </h2>
              <p className="mt-s-2 text-fs-body text-[var(--text-md)]">
                Add your first service to populate the dashboard.
              </p>
              <div className="mt-s-6 flex justify-center">
                <Button variant="accent" onClick={openCreate}>
                  Add your first service
                </Button>
              </div>
            </div>
          ) : (
            <DashboardGrid>
              {entries.flatMap((entry) => {
                const instances = configuredKinds[entry.kind]?.instances ?? [];
                return instances.map((inst) => (
                  <ServiceTile
                    key={`${entry.kind}:${inst.id}`}
                    kind={entry.kind}
                    instanceId={inst.id}
                    size={entry.size}
                    onOpenDetail={({ kind, instanceId }) => {
                      setOpenCtx({ kind, instanceId });
                      setSheetOpen(true);
                    }}
                  />
                ));
              })}
            </DashboardGrid>
          )}
        </main>

        <ServiceDetailSheet
          kind={openCtx?.kind}
          instanceId={openCtx?.instanceId}
          open={sheetOpen && !!openCtx}
          onOpenChange={setSheetOpen}
        />

        <Dialog
          open={editor.mode !== "closed"}
          onOpenChange={(open) => !open && setEditor({ mode: "closed" })}
        >
          <DialogContent className="max-w-lg">
            <DialogTitle>Add service</DialogTitle>
            {editor.mode === "create" && (
              <ServiceEditor
                submitting={createMut.isPending}
                onCancel={() => setEditor({ mode: "closed" })}
                onSubmit={async (input) => {
                  await createMut.mutateAsync(input);
                  setEditor({ mode: "closed" });
                }}
              />
            )}
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
