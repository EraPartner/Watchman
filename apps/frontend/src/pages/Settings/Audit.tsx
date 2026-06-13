import { SettingsLayout } from "./SettingsLayout";
import { useAudit } from "./useConfigQueries";

const ACTION_TONE: Record<string, string> = {
  create: "var(--ok)",
  update: "var(--accent)",
  delete: "var(--crit)",
  import: "var(--warn)",
  export: "var(--text-md)",
  rename: "var(--accent)",
};

export default function Audit() {
  const { data: entries, isLoading, error } = useAudit(200);

  return (
    <SettingsLayout
      eyebrow="settings · audit"
      title="Config audit"
      description="Recent configuration changes, most recent first."
    >
      {isLoading && (
        <p className="text-fs-body text-[var(--text-md)]">Loading…</p>
      )}
      {error && (
        <p className="text-fs-label text-[var(--crit)]">
          {(error as Error).message ?? "Failed to load"}
        </p>
      )}

      <ol className="space-y-s-2">
        {entries?.length === 0 && (
          <li className="text-fs-body text-[var(--text-lo)]">
            No activity yet.
          </li>
        )}
        {entries?.map((e) => (
          <li
            key={e.id}
            className="glass-regular overflow-hidden rounded-r-2 px-s-4 py-s-3"
          >
            <div className="flex items-baseline justify-between gap-s-4">
              <div>
                <div className="flex items-baseline gap-s-2 text-fs-body">
                  <span
                    className="font-mono uppercase tracking-[0.06em] text-fs-label"
                    style={{ color: ACTION_TONE[e.action] ?? "var(--text-md)" }}
                  >
                    {e.action}
                  </span>
                  <span className="font-mono text-[var(--text-hi)]">
                    {e.targetKind}/{e.targetId}
                  </span>
                </div>
                <div className="mt-s-1 text-fs-label text-[var(--text-lo)]">
                  {new Date(e.ts).toLocaleString()} · {e.actor ?? "system"}
                </div>
              </div>
              {e.diff && Object.keys(e.diff).length > 0 ? (
                <pre className="max-w-md overflow-x-auto rounded-r-1 bg-[var(--surface-2)] px-s-2 py-s-1 font-mono text-fs-label text-[var(--text-md)]">
                  {JSON.stringify(e.diff)}
                </pre>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </SettingsLayout>
  );
}
