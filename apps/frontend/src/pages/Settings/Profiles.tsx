import { useState } from "react";
import {
  Button,
  Badge,
  StatusDot,
  Dialog,
  DialogContent,
  DialogTitle,
  ConfirmDialog,
} from "../../components/primitives";
import { SettingsLayout } from "./SettingsLayout";
import {
  useProfiles,
  useActiveProfile,
  useCurrentNetwork,
  useCreateProfile,
  useUpdateProfile,
  useDeleteProfile,
  useSetActiveProfile,
  useSetAutoSwitch,
  useCaptureNetwork,
} from "./useProfileQueries";
import type { Profile } from "../../services/profilesApi";

type EditorState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; profile: Profile };

interface FormValues {
  name: string;
  description: string;
  color: string;
}

function ProfileEditor({
  existing,
  submitting,
  onCancel,
  onSubmit,
}: {
  existing?: Profile;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (v: FormValues) => Promise<void>;
}) {
  const [values, setValues] = useState<FormValues>({
    name: existing?.name ?? "",
    description: existing?.description ?? "",
    color: existing?.color ?? "#3b82f6",
  });
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="mt-s-4 flex flex-col gap-s-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          await onSubmit(values);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to save");
        }
      }}
    >
      <label className="flex flex-col gap-s-1">
        <span className="text-fs-label text-[var(--text-md)]">Name</span>
        <input
          autoFocus
          value={values.name}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          className="rounded-r-2 border border-[var(--hairline)] bg-[var(--surface-0)] px-s-3 py-s-2 text-fs-body text-[var(--text-hi)]"
          placeholder="Home"
        />
      </label>
      <label className="flex flex-col gap-s-1">
        <span className="text-fs-label text-[var(--text-md)]">
          Description (optional)
        </span>
        <input
          value={values.description}
          onChange={(e) =>
            setValues((v) => ({ ...v, description: e.target.value }))
          }
          className="rounded-r-2 border border-[var(--hairline)] bg-[var(--surface-0)] px-s-3 py-s-2 text-fs-body text-[var(--text-hi)]"
          placeholder="Home LAN services"
        />
      </label>
      <label className="flex items-center gap-s-3">
        <span className="text-fs-label text-[var(--text-md)]">Color</span>
        <input
          type="color"
          value={values.color}
          onChange={(e) => setValues((v) => ({ ...v, color: e.target.value }))}
          className="h-8 w-12 rounded-r-2 border border-[var(--hairline)] bg-[var(--surface-0)]"
        />
      </label>
      {error ? (
        <p className="text-fs-label text-[var(--crit)]">{error}</p>
      ) : null}
      <div className="flex justify-end gap-s-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="accent" disabled={submitting}>
          {existing ? "Save" : "Create"}
        </Button>
      </div>
    </form>
  );
}

export default function Profiles() {
  const { data: profiles, isLoading, error } = useProfiles();
  const { data: active } = useActiveProfile();
  const { data: network } = useCurrentNetwork();
  const createMut = useCreateProfile();
  const updateMut = useUpdateProfile();
  const deleteMut = useDeleteProfile();
  const setActiveMut = useSetActiveProfile();
  const setAutoSwitchMut = useSetAutoSwitch();
  const captureMut = useCaptureNetwork();

  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const [pendingDelete, setPendingDelete] = useState<Profile | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const currentMac = network?.signature.gatewayMac;

  return (
    <SettingsLayout
      eyebrow="settings · profiles"
      title="Profiles"
      description="A profile is a set of services for one location. Only the active profile is monitored; the rest are stopped. The active profile auto-switches by detected network."
      actions={
        <Button variant="accent" onClick={() => setEditor({ mode: "create" })}>
          + New profile
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

      <div className="mb-s-6 flex flex-wrap items-center justify-between gap-s-4 rounded-r-3 border border-[var(--hairline)] bg-[var(--surface-1)] px-s-4 py-s-3">
        <div className="text-fs-label text-[var(--text-md)]">
          {currentMac ? (
            <>
              Current network:{" "}
              <span className="font-mono text-[var(--text-hi)]">
                {network?.signature.subnet ?? currentMac}
              </span>{" "}
              {network?.matchedProfileId ? (
                <span className="text-[var(--ok)]">· recognized</span>
              ) : (
                <span className="text-[var(--warn)]">· unrecognized</span>
              )}
            </>
          ) : (
            <>Current network: not detected</>
          )}
        </div>
        <label className="flex items-center gap-s-2 text-fs-label text-[var(--text-md)]">
          <input
            type="checkbox"
            checked={active?.autoSwitch ?? false}
            disabled={setAutoSwitchMut.isPending}
            onChange={(e) => setAutoSwitchMut.mutate(e.target.checked)}
          />
          Auto-switch by network
        </label>
      </div>

      <div className="divide-y divide-[var(--hairline)] rounded-r-3 border border-[var(--hairline)] bg-[var(--surface-1)]">
        {profiles?.length === 0 && (
          <p className="p-s-6 text-fs-body text-[var(--text-lo)]">
            No profiles yet.
          </p>
        )}
        {profiles?.map((p) => {
          const isActive = p.id === active?.activeProfileId;
          const claimsCurrent =
            !!currentMac &&
            p.networkSigs.some(
              (s) => s.gatewayMac?.toLowerCase() === currentMac.toLowerCase()
            );
          return (
            <div
              key={p.id}
              className="flex items-center justify-between gap-s-4 px-s-4 py-s-3"
            >
              <div className="flex min-w-0 items-center gap-s-3">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: p.color || "var(--accent)" }}
                />
                <div className="min-w-0">
                  <div className="flex items-center gap-s-2">
                    <span className="truncate text-fs-body font-medium text-[var(--text-hi)]">
                      {p.name}
                    </span>
                    {isActive ? <Badge>active</Badge> : null}
                  </div>
                  <div className="truncate text-fs-label text-[var(--text-lo)]">
                    {p.serviceCount} service{p.serviceCount === 1 ? "" : "s"}
                    {" · "}
                    {p.networkSigs.length} network
                    {p.networkSigs.length === 1 ? "" : "s"}
                    {p.description ? ` · ${p.description}` : ""}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-s-2">
                {!isActive ? (
                  <Button
                    variant="tonal"
                    size="sm"
                    disabled={setActiveMut.isPending}
                    onClick={() => setActiveMut.mutate(p.id)}
                  >
                    Activate
                  </Button>
                ) : (
                  <StatusDot tone="ok" />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={
                    !currentMac || claimsCurrent || captureMut.isPending
                  }
                  title={
                    !currentMac
                      ? "No network detected"
                      : claimsCurrent
                        ? "Already assigned to this profile"
                        : "Assign the current network to this profile"
                  }
                  onClick={() => captureMut.mutate(p.id)}
                >
                  {claimsCurrent ? "Network ✓" : "Capture network"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditor({ mode: "edit", profile: p })}
                >
                  Edit
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[var(--crit)] hover:text-[var(--crit)] hover:brightness-110"
                  onClick={() => {
                    setDeleteError(null);
                    setPendingDelete(p);
                  }}
                >
                  Delete
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog
        open={editor.mode !== "closed"}
        onOpenChange={(open) => !open && setEditor({ mode: "closed" })}
      >
        <DialogContent className="max-w-md">
          <DialogTitle>
            {editor.mode === "edit" ? "Edit profile" : "New profile"}
          </DialogTitle>
          {editor.mode !== "closed" && (
            <ProfileEditor
              existing={editor.mode === "edit" ? editor.profile : undefined}
              submitting={createMut.isPending || updateMut.isPending}
              onCancel={() => setEditor({ mode: "closed" })}
              onSubmit={async (v) => {
                const patch = {
                  name: v.name,
                  description: v.description || undefined,
                  color: v.color || undefined,
                };
                if (editor.mode === "edit") {
                  await updateMut.mutateAsync({ id: editor.profile.id, patch });
                } else {
                  await createMut.mutateAsync(patch);
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
          title={`Delete profile "${pendingDelete.name}"?`}
          description={
            deleteError ??
            "A profile can only be deleted when it is not active and has no services."
          }
          destructive
          pending={deleteMut.isPending}
          onConfirm={async () => {
            try {
              await deleteMut.mutateAsync(pendingDelete.id);
              setPendingDelete(null);
            } catch (err) {
              setDeleteError(
                err instanceof Error ? err.message : "Could not delete profile"
              );
            }
          }}
        />
      ) : null}
    </SettingsLayout>
  );
}
