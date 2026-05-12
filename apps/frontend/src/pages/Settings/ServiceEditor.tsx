import { useEffect, useMemo, useState, type FormEvent } from "react";
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
  hideKind?: boolean;
  hideCancel?: boolean;
  onSubmit: (input: ServiceInstanceInput) => Promise<void>;
  onCancel: () => void;
  submitting?: boolean;
}

type FormValue = string | number | boolean | number[] | string[];
type FormValues = Record<string, FormValue>;

const COMMON_FIELD_NAMES = new Set([
  "instanceId",
  "enabled",
  "cacheTtlMs",
  "timeoutMs",
  "pollPolicy",
]);
const DEFAULT_CACHE_TTL_MS = 10_000;
const DEFAULT_TIMEOUT_MS = 5_000;
const INSTANCE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
const INSTANCE_ID_MAX_LENGTH = 64;

function validateInstanceId(value: string): string | null {
  if (value.length === 0) return "Instance id is required";
  if (value.length > INSTANCE_ID_MAX_LENGTH) {
    return `Max ${INSTANCE_ID_MAX_LENGTH} characters`;
  }
  if (!INSTANCE_ID_PATTERN.test(value)) {
    return "Use lowercase letters, digits, and dashes; must start with a letter or digit";
  }
  return null;
}

function defaultFor(f: FieldMeta): FormValue {
  if (f.default !== undefined && f.default !== null) {
    return f.default as FormValue;
  }
  if (f.type === "boolean") return false;
  if (f.type === "number") return "" as unknown as number;
  if (f.type === "stringArray" || f.type === "numberArray") return [];
  return "";
}

function initialValues(
  kind: KindSchema,
  existing?: ServiceInstance
): FormValues {
  const values: FormValues = {};
  for (const f of kind.fields) {
    if (COMMON_FIELD_NAMES.has(f.name)) continue;
    const current = existing?.config?.[f.name];
    if (current !== undefined && current !== null) {
      values[f.name] = current as FormValue;
    } else {
      values[f.name] = defaultFor(f);
    }
  }
  return values;
}

function arrayToCsv(v: FormValue): string {
  if (Array.isArray(v)) return v.join(", ");
  return v === undefined || v === null ? "" : String(v);
}

function parseCsv(v: string, numeric: boolean): FormValue {
  const parts = v
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (!numeric) return parts;
  return parts.map((s) => Number(s)).filter((n) => !Number.isNaN(n));
}

export default function ServiceEditor({
  existing,
  presetKind,
  hideKind,
  hideCancel,
  onSubmit,
  onCancel,
  submitting,
}: ServiceEditorProps) {
  const { data: kinds, isLoading } = useKinds();
  const testMut = useTestService();

  const [selectedKind, setSelectedKind] = useState<string>(
    existing?.kind ?? presetKind ?? ""
  );
  const [instanceId, setInstanceId] = useState(
    existing?.instanceId ?? "main"
  );
  const [enabled, setEnabled] = useState(existing?.enabled ?? true);
  const [cacheTtlMs, setCacheTtlMs] = useState<number>(DEFAULT_CACHE_TTL_MS);
  const [timeoutMs, setTimeoutMs] = useState<number>(DEFAULT_TIMEOUT_MS);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [values, setValues] = useState<FormValues>({});
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  const kindSchema = kinds?.find((k) => k.kind === selectedKind);

  const renderedFields = useMemo(
    () =>
      kindSchema?.fields.filter((f) => !COMMON_FIELD_NAMES.has(f.name)) ?? [],
    [kindSchema]
  );

  const trimmedInstanceId = instanceId.trim();
  const instanceIdError = validateInstanceId(trimmedInstanceId);
  const isRenaming =
    !!existing && existing.instanceId !== trimmedInstanceId && !instanceIdError;

  useEffect(() => {
    if (kindSchema) {
      setValues(initialValues(kindSchema, existing));
      const cacheField = kindSchema.fields.find((f) => f.name === "cacheTtlMs");
      const timeoutField = kindSchema.fields.find((f) => f.name === "timeoutMs");
      const existingCache = existing?.config?.cacheTtlMs;
      const existingTimeout = existing?.config?.timeoutMs;
      setCacheTtlMs(
        typeof existingCache === "number"
          ? existingCache
          : (cacheField?.default as number | undefined) ?? DEFAULT_CACHE_TTL_MS
      );
      setTimeoutMs(
        typeof existingTimeout === "number"
          ? existingTimeout
          : (timeoutField?.default as number | undefined) ?? DEFAULT_TIMEOUT_MS
      );
    }
  }, [kindSchema, existing]);

  if (isLoading) return <p>Loading schemas…</p>;
  if (!kinds) return <p>No schemas available.</p>;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!selectedKind) return setError("Pick a service kind");
    if (instanceIdError) return setError(instanceIdError);

    const config: Record<string, unknown> = {};
    for (const f of renderedFields) {
      const v = values[f.name];
      if (f.secret && (v === "" || v === "***")) continue;
      if (v === "" && !f.required) continue;
      if (Array.isArray(v) && v.length === 0 && !f.required) continue;
      config[f.name] = v;
    }

    try {
      await onSubmit({
        kind: selectedKind,
        instanceId: trimmedInstanceId,
        enabled,
        cacheTtlMs,
        timeoutMs,
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
      {!hideKind && (
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
      )}

      <label className="block">
        <span className="text-sm text-muted-foreground">
          Instance id <span className="text-red-500">*</span>
        </span>
        <input
          className="mt-1 block w-full rounded border bg-transparent px-3 py-2"
          value={instanceId}
          onChange={(e) => setInstanceId(e.target.value)}
          placeholder="main"
          aria-invalid={instanceIdError !== null}
          aria-describedby="instance-id-help"
        />
        {instanceIdError ? (
          <span
            id="instance-id-help"
            className="text-xs text-red-500"
            role="alert"
          >
            {instanceIdError}
          </span>
        ) : (
          <span id="instance-id-help" className="text-xs text-muted-foreground">
            Unique name for this instance. Lowercase letters, digits, dashes;
            up to {INSTANCE_ID_MAX_LENGTH} characters. Default "main".
          </span>
        )}
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Enabled
      </label>

      {renderedFields.map((f) => (
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

      <details
        open={advancedOpen}
        onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
        className="rounded border border-white/10 px-3 py-2"
      >
        <summary className="cursor-pointer text-sm text-muted-foreground">
          Advanced
        </summary>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="text-sm text-muted-foreground">Cache TTL (ms)</span>
            <input
              type="number"
              className="mt-1 block w-full rounded border bg-transparent px-3 py-2 text-sm"
              value={cacheTtlMs}
              onChange={(e) => setCacheTtlMs(Number(e.target.value))}
            />
            <span className="text-xs text-muted-foreground">
              How long to cache results. Default {DEFAULT_CACHE_TTL_MS}.
            </span>
          </label>
          <label className="block">
            <span className="text-sm text-muted-foreground">Timeout (ms)</span>
            <input
              type="number"
              className="mt-1 block w-full rounded border bg-transparent px-3 py-2 text-sm"
              value={timeoutMs}
              onChange={(e) => setTimeoutMs(Number(e.target.value))}
            />
            <span className="text-xs text-muted-foreground">
              Per-request timeout. Default {DEFAULT_TIMEOUT_MS}.
            </span>
          </label>
        </div>
      </details>

      <p className="text-xs text-muted-foreground">
        Fields marked <span className="text-red-500">*</span> are required.
      </p>

      {testResult && <p className="text-sm">{testResult}</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {isRenaming && (
        <p
          className="text-xs text-[var(--warn,#b58900)]"
          role="status"
          data-testid="rename-hint"
        >
          Renaming will reset the in-memory metric history for this instance.
        </p>
      )}

      <div className="flex gap-2 justify-end">
        {existing && (
          <Button type="button" variant="ghost" onClick={handleTest}>
            Test connection
          </Button>
        )}
        {!hideCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          type="submit"
          variant="accent"
          disabled={submitting || instanceIdError !== null}
        >
          {submitting ? "Saving…" : "Save"}
        </Button>
      </div>
    </form>
  );
}

interface FieldInputProps {
  field: FieldMeta;
  value: FormValue | undefined;
  onChange: (v: FormValue) => void;
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
  const labelNode = (
    <span className="text-sm text-muted-foreground">
      {field.label}
      {field.required && <span className="text-red-500"> *</span>}
    </span>
  );

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
        {labelNode}
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

  if (field.type === "stringArray" || field.type === "numberArray") {
    return (
      <label className="block">
        {labelNode}
        <input
          type="text"
          className={base}
          value={arrayToCsv(value as FormValue)}
          placeholder={field.placeholder ?? "comma-separated"}
          onChange={(e) =>
            onChange(parseCsv(e.target.value, field.type === "numberArray"))
          }
        />
        <span className="text-xs text-muted-foreground">
          {field.help ?? "Comma-separated list."}
        </span>
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
      {labelNode}
      <input
        type={inputType}
        className={base}
        value={value === undefined || value === null ? "" : String(value)}
        placeholder={secretPlaceholder ?? field.placeholder}
        onChange={(e) => {
          const v = e.target.value;
          onChange(field.type === "number" ? (v === "" ? "" : Number(v)) : v);
        }}
      />
      {field.help && (
        <span className="text-xs text-muted-foreground">{field.help}</span>
      )}
    </label>
  );
}
