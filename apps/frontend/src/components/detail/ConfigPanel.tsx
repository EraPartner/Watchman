import type { ServiceInstance } from "@/services/configApi";
import { Button } from "@/components/primitives/Button";
import { useTestService } from "@/pages/Settings/useConfigQueries";
import { toast } from "sonner";

export interface ConfigPanelProps {
  service: ServiceInstance | undefined;
}

function fmtConfigValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v);
    }
  }
  return String(v);
}

function fmtTs(iso?: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function ConfigPanel({ service }: ConfigPanelProps) {
  const test = useTestService();

  if (!service) {
    return (
      <p className="text-fs-label text-[var(--text-lo)]">
        No configuration available.
      </p>
    );
  }

  const handleTest = async () => {
    try {
      const result = await test.mutateAsync(service.id);
      if (result.ok) {
        toast.success(
          `Connection ok${
            result.latencyMs !== undefined
              ? ` (${Math.round(result.latencyMs)} ms)`
              : ""
          }`
        );
      } else {
        toast.error(`Connection failed${result.error ? `: ${result.error}` : ""}`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    }
  };

  const summaryRows: Array<[string, string]> = [
    ["Kind", service.kind],
    ["Instance ID", service.instanceId],
    ["Enabled", service.enabled ? "yes" : "no"],
    ["Created", fmtTs(service.createdAt)],
    ["Updated", fmtTs(service.updatedAt)],
  ];

  const configRows = Object.entries(service.config ?? {}).filter(
    ([k]) => k !== "kind" && k !== "instanceId" && k !== "enabled"
  );

  return (
    <div className="space-y-s-6">
      <section className="space-y-s-2">
        <header className="flex items-baseline justify-between">
          <h3 className="text-fs-label font-[600] uppercase tracking-[0.06em] text-[var(--text-lo)]">
            Identity
          </h3>
          <Button size="sm" variant="tonal" onClick={handleTest} disabled={test.isPending}>
            {test.isPending ? "Testing…" : "Test connection"}
          </Button>
        </header>
        <dl className="grid grid-cols-2 gap-x-s-4 gap-y-s-2 text-fs-label">
          {summaryRows.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-[var(--text-lo)]">{label}</dt>
              <dd className="truncate font-mono tabular-nums text-[var(--text-hi)]">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="space-y-s-2">
        <h3 className="text-fs-label font-[600] uppercase tracking-[0.06em] text-[var(--text-lo)]">
          Configuration
        </h3>
        {configRows.length === 0 ? (
          <p className="text-fs-label text-[var(--text-lo)]">
            No additional configuration recorded.
          </p>
        ) : (
          <dl className="grid grid-cols-1 gap-x-s-4 gap-y-s-2 sm:grid-cols-2">
            {configRows.map(([k, v]) => (
              <div
                key={k}
                className="min-w-0 border-b border-[var(--hairline)] pb-s-2 last:border-b-0"
              >
                <dt className="truncate font-mono text-fs-label text-[var(--text-lo)]">
                  {k}
                </dt>
                <dd className="truncate font-mono text-fs-body text-[var(--text-hi)]">
                  {v === "***" ? (
                    <span className="text-[var(--text-md)]">•••••• (secret)</span>
                  ) : (
                    fmtConfigValue(v)
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
    </div>
  );
}
