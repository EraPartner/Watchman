import { useState } from "react";
import {
  TooltipProvider,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/primitives";
import { DashboardGrid } from "./DashboardGrid";
import { ServiceTile } from "@/components/tile/ServiceTile";
import { ServiceDetailSheet } from "@/components/detail/ServiceDetailSheet";
import { BENTO_LAYOUT } from "@/config/bentoLayout";
import { getRenderer } from "@/services/renderers";
import { useServiceInstances } from "@/hooks/useServiceInstances";
import { useCreateService } from "@/pages/Settings/useConfigQueries";
import ServiceEditor from "@/pages/Settings/ServiceEditor";
import type { ServiceKind } from "@/services/renderers/types";

interface OpenCtx {
  kind: ServiceKind;
  instanceId?: string;
}

type EditorState = { mode: "closed" } | { mode: "create" };

export default function BentoDashboard() {
  const [openCtx, setOpenCtx] = useState<OpenCtx | null>(null);
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const { data, isLoading } = useServiceInstances();
  const createMut = useCreateService();

  const configuredKinds = data?.instances ?? {};
  const entries = BENTO_LAYOUT.filter(
    (e) => getRenderer(e.kind) && (configuredKinds[e.kind]?.count ?? 0) > 0,
  );

  const openCreate = () => setEditor({ mode: "create" });

  return (
    <TooltipProvider>
      <main className="min-h-screen bg-[var(--surface-0)] px-s-8 py-s-10 text-[var(--text-hi)]">
        <header className="mb-s-8 flex items-start justify-between gap-s-4">
          <div className="space-y-s-2">
            <p className="text-fs-label uppercase tracking-[0.12em] text-[var(--text-lo)]">
              Watchman · Bento
            </p>
            <h1 className="text-fs-h1 font-[700] tracking-[-0.02em]">
              Service dashboard
            </h1>
          </div>
          <Button variant="accent" onClick={openCreate}>
            + Add service
          </Button>
        </header>

        {!isLoading && entries.length === 0 ? (
          <div className="rounded-lg border border-[var(--border-lo)] bg-[var(--surface-1)] p-s-8 text-center text-[var(--text-lo)]">
            <p className="text-fs-body">No services configured yet.</p>
            <p className="mt-s-2 text-fs-label">
              Add your first service to populate the dashboard.
            </p>
            <div className="mt-s-4 flex justify-center">
              <Button variant="accent" onClick={openCreate}>
                Add your first service
              </Button>
            </div>
          </div>
        ) : (
          <DashboardGrid>
            {entries.flatMap((entry) => {
              const instances =
                configuredKinds[entry.kind]?.instances ?? [];
              return instances.map((inst) => (
                <ServiceTile
                  key={`${entry.kind}:${inst.id}`}
                  kind={entry.kind}
                  instanceId={inst.id}
                  size={entry.size}
                  onOpenDetail={({ kind, instanceId }) =>
                    setOpenCtx({ kind, instanceId })
                  }
                />
              ));
            })}
          </DashboardGrid>
        )}

        <ServiceDetailSheet
          kind={openCtx?.kind}
          instanceId={openCtx?.instanceId}
          open={!!openCtx}
          onOpenChange={(o) => (o ? null : setOpenCtx(null))}
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
      </main>
    </TooltipProvider>
  );
}
