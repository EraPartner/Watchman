import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/primitives";
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
    <div className="min-h-screen bg-[var(--surface-0)] p-6">
      <div className="max-w-3xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold">Backup & restore</h1>
            <p className="text-sm text-muted-foreground">
              Export an encrypted bundle of every service config, or restore
              one. The bundle is encrypted with your server master key.
            </p>
          </div>
          <Link to="/settings/services">
            <Button variant="ghost">Back</Button>
          </Link>
        </header>

        <section className="rounded border p-4 mb-6">
          <h2 className="font-medium mb-2">Export</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Download all service configurations as an encrypted JSON file.
            Secrets remain encrypted with the server&apos;s master key.
          </p>
          <Button
            variant="accent"
            onClick={handleExport}
            disabled={exportMut.isPending}
          >
            {exportMut.isPending ? "Exporting…" : "Download backup"}
          </Button>
          {exportMut.error && (
            <p className="text-red-500 text-sm mt-2">
              {(exportMut.error as Error).message}
            </p>
          )}
        </section>

        <section className="rounded border p-4">
          <h2 className="font-medium mb-2">Restore</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Upload a previously exported bundle. Entries with a matching
            <code className="mx-1">(kind, instanceId)</code> are updated;
            others are created. Requires the same master key that produced
            the bundle.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            onChange={handleImport}
            disabled={importMut.isPending}
            className="block text-sm"
          />
          {importMut.isPending && (
            <p className="text-sm text-muted-foreground mt-2">Importing…</p>
          )}
          {importError && (
            <p className="text-red-500 text-sm mt-2">{importError}</p>
          )}
          {importResult && (
            <div className="text-sm mt-3 space-y-1">
              <p>
                Imported: {importResult.imported} · Updated:{" "}
                {importResult.updated} · Skipped: {importResult.skipped}
              </p>
              {importResult.errors.length > 0 && (
                <details>
                  <summary className="text-red-500 cursor-pointer">
                    {importResult.errors.length} error(s)
                  </summary>
                  <ul className="mt-2 space-y-1 text-xs">
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
    </div>
  );
}
