import { Link } from "react-router-dom";
import { Button } from "../../components/primitives";
import { useAudit } from "./useConfigQueries";

export default function Audit() {
  const { data: entries, isLoading, error } = useAudit(200);

  return (
    <div className="min-h-screen bg-[var(--surface-0)] p-6">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Config audit</h1>
            <p className="text-sm text-muted-foreground">
              Recent configuration changes.
            </p>
          </div>
          <Link to="/settings/services">
            <Button variant="ghost">Back</Button>
          </Link>
        </header>

        {isLoading && <p>Loading…</p>}
        {error && (
          <p className="text-red-500 text-sm">
            {(error as Error).message ?? "Failed to load"}
          </p>
        )}

        <ol className="space-y-2">
          {entries?.length === 0 && (
            <li className="text-sm text-muted-foreground">No activity yet.</li>
          )}
          {entries?.map((e) => (
            <li
              key={e.id}
              className="rounded border p-3 flex items-start justify-between gap-4"
            >
              <div>
                <div className="text-sm font-medium">
                  <span className="uppercase tracking-wide">{e.action}</span>
                  {" · "}
                  {e.targetKind}/{e.targetId}
                </div>
                <div className="text-xs text-muted-foreground">
                  {new Date(e.ts).toLocaleString()} · {e.actor ?? "system"}
                </div>
              </div>
              <pre className="text-xs text-muted-foreground max-w-md overflow-x-auto">
                {JSON.stringify(e.diff, null, 0)}
              </pre>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
