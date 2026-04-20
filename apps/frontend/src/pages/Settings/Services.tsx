import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  StatusDot,
  Dialog,
  DialogContent,
  DialogTitle,
  ConfirmDialog,
} from "../../components/primitives";
import ServiceEditor from "./ServiceEditor";
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
    <div className="min-h-screen bg-[var(--surface-0)] p-6">
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Services</h1>
            <p className="text-sm text-muted-foreground">
              Configure monitored services.
            </p>
          </div>
          <div className="flex gap-2">
            <Link to="/settings/audit">
              <Button variant="ghost">Audit</Button>
            </Link>
            <Link to="/settings/backup">
              <Button variant="ghost">Backup</Button>
            </Link>
            <Button
              variant="accent"
              onClick={() => setEditor({ mode: "create" })}
            >
              + Add service
            </Button>
          </div>
        </header>

        {isLoading && <p>Loading…</p>}
        {error && (
          <p className="text-red-500 text-sm">
            {(error as Error).message ?? "Failed to load"}
          </p>
        )}

        <div className="rounded border divide-y">
          {services?.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              No services configured yet.
            </p>
          )}
          {services?.map((svc) => (
            <div
              key={svc.id}
              className="flex items-center justify-between p-3"
            >
              <div className="flex items-center gap-3">
                <StatusDot tone={svc.enabled ? "ok" : "neutral"} />
                <div>
                  <div className="font-medium">
                    {svc.kind} / {svc.instanceId}
                  </div>
                  <div className="text-xs text-muted-foreground">{svc.id}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
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
                  onClick={() => setPendingDelete(svc)}
                >
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
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
    </div>
  );
}
