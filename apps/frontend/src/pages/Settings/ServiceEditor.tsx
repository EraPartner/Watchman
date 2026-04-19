import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../../components/primitives";
import type {
  FieldMeta,
  KindSchema,
  ServiceInstance,
  ServiceInstanceInput,
} from "../../services/configApi";
import { useKinds, useTestService } from "./useConfigQueries";

interface ServiceEditorProps {
  existing?: ServiceInstance;
  presetKind?: string;
  onSubmit: (input: ServiceInstanceInput) => Promise<void>;
  onCancel: () => void;
  submitting?: boolean;
}

type FormValues = Record<string, string | number | boolean>;

function initialValues(
  kind: KindSchema,
  existing?: ServiceInstance
): FormValues {
  const values: FormValues = {};
  for (const f of kind.fields) {
    const current = existing?.config?.[f.name];
    if (current !== undefined && current !== null) {
      values[f.name] = current as string | number | boolean;
    } else if (f.type === "boolean") {
      values[f.name] = false;
    } else if (f.type === "number") {
      values[f.name] = 0;
    } else {
      values[f.name] = "";
    }
  }
  return values;
}

export default function ServiceEditor({
  existing,
  presetKind,
  onSubmit,
  onCancel,
  submitting,
}: ServiceEditorProps) {
  const { data: kinds, isLoading } = useKinds();
  const testMut = useTestService();

  const [selectedKind, setSelectedKind] = useState<string>(
    existing?.kind ?? presetKind ?? ""
  );
  const [instanceId, setInstanceId] = useState(existing?.instanceId ?? "");
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [values, setValues] = useState<FormValues>({});
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const kindSchema = kinds?.find((k) => k.kind === selectedKind);

  useEffect(() => {
    if (kindSchema) {
      setValues(initialValues(kindSchema, existing));
    }
  }, [kindSchema, existing]);

  if (isLoading) return <p>Loading schemas…</p>;
  if (!kinds) return <p>No schemas available.</p>;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selectedKind) return setError("Pick a service kind");
    if (!instanceId.trim()) return setError("Instance id required");

    const config: Record<string, unknown> = {};
    if (kindSchema) {
      for (const f of kindSchema.fields) {
        const v = values[f.name];
        if (f.secret && (v === "" || v === "***")) continue;
        if (v === "" && !f.required) continue;
        config[f.name] = v;
      }
    }

    try {
      await onSubmit({
        kind: selectedKind,
        instanceId: instanceId.trim(),
        enabled,
        config,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const handleTest = async () => {
    if (!existing) {
      setTestResult("Save the service before testing");
      return;
    }
    setTestResult("Testing…");
    try {
      const res = await testMut.mutateAsync(existing.id);
      setTestResult(
        res.ok
          ? `OK (${res.latencyMs}ms)`
          : `Failed: ${res.error?.message ?? "unknown"}`
      );
    } catch (err) {
      setTestResult(err instanceof Error ? err.message : "Test failed");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <label className="block">
        <span className="text-sm text-muted-foreground">Kind</span>
        <select
          className="mt-1 block w-full rounded border bg-transparent px-3 py-2"
          value={selectedKind}
          onChange={(e) => setSelectedKind(e.target.value)}
          disabled={!!existing}
        >
          <option value="">— select —</option>
          {kinds.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-sm text-muted-foreground">Instance id</span>
        <input
          className="mt-1 block w-full rounded border bg-transparent px-3 py-2"
          value={instanceId}
          onChange={(e) => setInstanceId(e.target.value)}
          disabled={!!existing}
          placeholder="e.g. primary"
        />
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Enabled
      </label>

      {kindSchema?.fields.map((f) => (
        <FieldInput
          key={f.name}
          field={f}
          value={values[f.name]}
          onChange={(v) => setValues((prev) => ({ ...prev, [f.name]: v }))}
          secretPlaceholder={
            existing && f.secret ? "(saved — leave blank to keep)" : undefined
          }
        />
      ))}

      {testResult && <p className="text-sm">{testResult}</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex gap-2 justify-end">
        {existing && (
          <Button type="button" variant="ghost" onClick={handleTest}>
            Test connection
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="accent" disabled={submitting}>
          {submitting ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

interface FieldInputProps {
  field: FieldMeta;
  value: string | number | boolean | undefined;
  onChange: (v: string | number | boolean) => void;
  secretPlaceholder?: string;
}

function FieldInput({
  field,
  value,
  onChange,
  secretPlaceholder,
}: FieldInputProps) {
  const base =
    "mt-1 block w-full rounded border bg-transparent px-3 py-2 text-sm";

  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={!!value}
          onChange={(e) => onChange(e.target.checked)}
        />
        {field.label}
      </label>
    );
  }

  if (field.type === "select") {
    return (
      <label className="block">
        <span className="text-sm text-muted-foreground">{field.label}</span>
        <select
          className={base}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">—</option>
          {field.options?.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {field.help && (
          <span className="text-xs text-muted-foreground">{field.help}</span>
        )}
      </label>
    );
  }

  const inputType =
    field.type === "password"
      ? "password"
      : field.type === "number"
        ? "number"
        : field.type === "url"
          ? "url"
          : "text";

  return (
    <label className="block">
      <span className="text-sm text-muted-foreground">{field.label}</span>
      <input
        type={inputType}
        className={base}
        value={value === undefined || value === null ? "" : String(value)}
        placeholder={secretPlaceholder ?? field.placeholder}
        onChange={(e) => {
          const v = e.target.value;
          onChange(field.type === "number" ? Number(v) : v);
        }}
      />
      {field.help && (
        <span className="text-xs text-muted-foreground">{field.help}</span>
      )}
    </label>
  );
}
