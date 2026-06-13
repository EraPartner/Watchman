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
  useServiceLoadErrors,
  useCreateService,
  useUpdateService,
  useDeleteService,
} from "./useConfigQueries";
import { useProfiles, useMoveServiceProfile } from "./useProfileQueries";
import type { ServiceInstance } from "../../services/configApi";

type EditorState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; service: ServiceInstance };

// Both a live service and a failed-to-load row carry these — enough to confirm a delete.
type DeleteTarget = { id: string; kind: string; instanceId: string };

export default function Services() {
  const { data: services, isLoading, error } = useServices();
  const { data: loadErrors } = useServiceLoadErrors();
  const { data: profiles } = useProfiles();
  const createMut = useCreateService();
  const updateMut = useUpdateService();
  const deleteMut = useDeleteService();
  const moveMut = useMoveServiceProfile();
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const [pendingDelete, setPendingDelete] = useState<DeleteTarget | null>(null);

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
      {isLoading && (
        <p className="text-fs-body text-[var(--text-md)]">Loading…</p>
      )}
      {error && (
        <p className="text-fs-label text-[var(--crit)]">
          {(error as Error).message ?? "Failed to load"}
        </p>
      )}

      {loadErrors && loadErrors.length > 0 && (
        <div className="glass-regular glass-tone-crit flex flex-col gap-s-3 overflow-hidden rounded-r-3 p-s-4">
          <div className="text-fs-label font-medium text-[var(--crit)]">
            {loadErrors.length} service
            {loadErrors.length === 1 ? "" : "s"} could not be loaded
          </div>
          <p className="text-fs-label text-[var(--text-lo)]">
            These rows were skipped so the other services keep running. Common
            causes: the server master key changed (secrets no longer decrypt),
            the stored config drifted from the current schema, or an unknown
            service kind. Remove and re-add to fix.
          </p>
          <div className="flex flex-col divide-y divide-[var(--hairline)]">
            {loadErrors.map((err) => (
              <div
                key={err.id}
                className="flex items-center justify-between gap-s-4 py-s-2"
              >
                <div className="min-w-0">
                  <div className="truncate font-mono text-fs-body text-[var(--text-hi)]">
                    {err.kind} / {err.instanceId}
                  </div>
                  <div className="truncate text-fs-label text-[var(--text-lo)]">
                    {err.message}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[var(--crit)] hover:text-[var(--crit)] hover:brightness-110"
                  onClick={() => setPendingDelete(err)}
                >
                  Remove
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="glass-regular divide-y divide-[var(--hairline)] overflow-hidden rounded-r-3">
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
              {profiles && profiles.length > 0 ? (
                <select
                  aria-label="Profile"
                  value={svc.profileId}
                  disabled={moveMut.isPending}
                  onChange={(e) =>
                    moveMut.mutate({ id: svc.id, profileId: e.target.value })
                  }
                  className="rounded-r-2 border border-[var(--hairline)] bg-[var(--surface-0)] px-s-2 py-s-1 text-fs-label text-[var(--text-md)]"
                  title="Owning profile"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              ) : null}
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
