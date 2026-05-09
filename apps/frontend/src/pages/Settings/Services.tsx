import { useState } from "react";
import {
  Button,
  StatusDot,
  Dialog,
  DialogContent,
  DialogTitle,
  ConfirmDialog,
} from "../../components/primitives";
import ServiceEditor from "./ServiceEditor";
import { SettingsLayout } from "./SettingsLayout";
import {
  useServices,
  useCreateService,
  useUpdateService,
  useDeleteService,
} from "./useConfigQueries";
import type { ServiceInstance } from "../../services/configApi";

type EditorState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; service: ServiceInstance };

export default function Services() {
  const { data: services, isLoading, error } = useServices();
  const createMut = useCreateService();
  const updateMut = useUpdateService();
  const deleteMut = useDeleteService();
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const [pendingDelete, setPendingDelete] = useState<ServiceInstance | null>(
    null,
  );

  return (
    <SettingsLayout
      eyebrow="settings · services"
      title="Services"
      description="Configure monitored services. Secrets are encrypted with the server master key."
      actions={
        <Button variant="accent" onClick={() => setEditor({ mode: "create" })}>
          + Add service
        </Button>
      }
    >
      {isLoading && <p className="text-fs-body text-[var(--text-md)]">Loading…</p>}
      {error && (
        <p className="text-fs-label text-[var(--crit)]">
          {(error as Error).message ?? "Failed to load"}
        </p>
      )}

      <div className="rounded-r-3 border border-[var(--hairline)] bg-[var(--surface-1)] divide-y divide-[var(--hairline)]">
        {services?.length === 0 && (
          <p className="p-s-6 text-fs-body text-[var(--text-lo)]">
            No services configured yet.
          </p>
        )}
        {services?.map((svc) => (
          <div
            key={svc.id}
            className="flex items-center justify-between gap-s-4 px-s-4 py-s-3"
          >
            <div className="flex min-w-0 items-center gap-s-3">
              <StatusDot tone={svc.enabled ? "ok" : "neutral"} />
              <div className="min-w-0">
                <div className="truncate font-mono text-fs-body text-[var(--text-hi)]">
                  {svc.kind} / {svc.instanceId}
                </div>
                <div className="truncate text-fs-label text-[var(--text-lo)]">
                  {svc.id}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-s-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  updateMut.mutate({
                    id: svc.id,
                    input: { enabled: !svc.enabled },
                  })
                }
              >
                {svc.enabled ? "Disable" : "Enable"}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditor({ mode: "edit", service: svc })}
              >
                Edit
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="text-[var(--crit)] hover:text-[var(--crit)] hover:brightness-110"
                onClick={() => setPendingDelete(svc)}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog
        open={editor.mode !== "closed"}
        onOpenChange={(open) => !open && setEditor({ mode: "closed" })}
      >
        <DialogContent className="max-w-lg">
          <DialogTitle>
            {editor.mode === "edit" ? "Edit service" : "Add service"}
          </DialogTitle>
          {editor.mode !== "closed" && (
            <ServiceEditor
              existing={editor.mode === "edit" ? editor.service : undefined}
              submitting={createMut.isPending || updateMut.isPending}
              onCancel={() => setEditor({ mode: "closed" })}
              onSubmit={async (input) => {
                if (editor.mode === "edit") {
                  await updateMut.mutateAsync({
                    id: editor.service.id,
                    input,
                  });
                } else {
                  await createMut.mutateAsync(input);
                }
                setEditor({ mode: "closed" });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      {pendingDelete ? (
        <ConfirmDialog
          open={!!pendingDelete}
          onOpenChange={(open) => !open && setPendingDelete(null)}
          title={`Delete ${pendingDelete.kind}/${pendingDelete.instanceId}?`}
          description="This removes the service and stops polling. Cannot be undone without re-adding."
          destructive
          pending={deleteMut.isPending}
          onConfirm={async () => {
            await deleteMut.mutateAsync(pendingDelete.id);
            setPendingDelete(null);
          }}
        />
      ) : null}
    </SettingsLayout>
  );
}
