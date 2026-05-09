import { useRef, useState } from "react";
import { Button } from "../../components/primitives";
import { SettingsLayout } from "./SettingsLayout";
import { useExportConfig, useImportConfig } from "./useConfigQueries";
import type { ExportBundle, ImportResult } from "../../services/configApi";

export default function BackupRestore() {
  const exportMut = useExportConfig();
  const importMut = useImportConfig();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  async function handleExport() {
    const bundle = await exportMut.mutateAsync();
    const blob = new Blob([JSON.stringify(bundle, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `watchman-config-${bundle.exportedAt.slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    setImportResult(null);
    setImportError(null);
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const bundle = JSON.parse(text) as ExportBundle;
      const result = await importMut.mutateAsync(bundle);
      setImportResult(result);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <SettingsLayout
      eyebrow="settings · backup"
      title="Backup & restore"
      description="Export every service config as an encrypted bundle, or restore from one. Bundles are encrypted with the server master key."
    >
      <div className="grid grid-cols-1 gap-s-4 md:grid-cols-2">
        <section className="rounded-r-3 border border-[var(--hairline)] bg-[var(--surface-1)] p-s-6">
          <h2 className="text-fs-label font-[600] uppercase tracking-[0.06em] text-[var(--text-lo)]">
            Export
          </h2>
          <p className="mt-s-2 text-fs-body text-[var(--text-md)]">
            Download all service configurations as an encrypted JSON file.
            Secrets remain encrypted with the server master key.
          </p>
          <div className="mt-s-4">
            <Button
              variant="accent"
              onClick={handleExport}
              disabled={exportMut.isPending}
            >
              {exportMut.isPending ? "Exporting…" : "Download backup"}
            </Button>
          </div>
          {exportMut.error && (
            <p className="mt-s-3 text-fs-label text-[var(--crit)]">
              {(exportMut.error as Error).message}
            </p>
          )}
        </section>

        <section className="rounded-r-3 border border-[var(--hairline)] bg-[var(--surface-1)] p-s-6">
          <h2 className="text-fs-label font-[600] uppercase tracking-[0.06em] text-[var(--text-lo)]">
            Restore
          </h2>
          <p className="mt-s-2 text-fs-body text-[var(--text-md)]">
            Upload a previously exported bundle. Entries with a matching
            <code className="mx-1 rounded-r-1 bg-[var(--surface-2)] px-s-1 py-px font-mono text-fs-label">
              (kind, instanceId)
            </code>
            are updated; others are created. Requires the same master key that
            produced the bundle.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            onChange={handleImport}
            disabled={importMut.isPending}
            className="mt-s-4 block w-full text-fs-label text-[var(--text-md)] file:mr-s-3 file:rounded-r-2 file:border-0 file:bg-[var(--surface-2)] file:px-s-3 file:py-s-1 file:text-[var(--text-hi)]"
          />
          {importMut.isPending && (
            <p className="mt-s-2 text-fs-label text-[var(--text-lo)]">Importing…</p>
          )}
          {importError && (
            <p className="mt-s-2 text-fs-label text-[var(--crit)]">{importError}</p>
          )}
          {importResult && (
            <div className="mt-s-3 space-y-s-1 font-mono text-fs-label text-[var(--text-md)]">
              <p>
                Imported: {importResult.imported} · Updated:{" "}
                {importResult.updated} · Skipped: {importResult.skipped}
              </p>
              {importResult.errors.length > 0 && (
                <details>
                  <summary className="cursor-pointer text-[var(--crit)]">
                    {importResult.errors.length} error(s)
                  </summary>
                  <ul className="mt-s-2 space-y-s-1">
                    {importResult.errors.map((er, i) => (
                      <li key={i}>
                        {er.kind}/{er.instanceId}: {er.message}
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </section>
      </div>
    </SettingsLayout>
  );
}
