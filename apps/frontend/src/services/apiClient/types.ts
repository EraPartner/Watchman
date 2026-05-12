// v2 API types. Matches apps/backend/openapi.yaml.

export interface HostHealth {
  reachable: boolean;
  pingMs?: number;
}

export interface ServiceHealth {
  reachable: boolean;
  latencyMs?: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface HealthSnapshot {
  reachable: boolean;
  latencyMs?: number;
  message?: string;
  details?: Record<string, unknown>;
  at: string;
  host?: HostHealth;
  service?: ServiceHealth;
}

export type StatsMetricValue = number | string | boolean | null;

export interface StatsSnapshot {
  metrics: Record<string, StatsMetricValue>;
  at: string;
}

export interface InstanceInfo {
  id: string;
  kind: string;
  instanceId: string;
}

export type AggregatedResult =
  | { ok: true; value: HealthSnapshot }
  | { ok: false; error: { code: string; message: string } };

export interface AggregatedEntry {
  kind: string;
  instanceId: string;
  result: AggregatedResult;
}

export interface SetupStatus {
  needsSetup: boolean;
  serviceCount: number;
}

export interface BackendVersion {
  version: string;
}

export interface BackendHealth {
  status: string;
  [key: string]: unknown;
}

export interface ControlRequest {
  action: string;
  params?: Record<string, unknown>;
}

export interface ControlResponse {
  ok: boolean;
  [key: string]: unknown;
}

// --- Config / services ---

export interface FieldMeta {
  name: string;
  label: string;
  type: string;
  required?: boolean;
  secret?: boolean;
  default?: unknown;
  help?: string;
}

export interface KindSchema {
  kind: string;
  displayName?: string;
  fields: FieldMeta[];
}

export interface ServiceRecord {
  id: string;
  kind: string;
  instanceId: string;
  displayName?: string;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface ServiceRecordPublic {
  id: string;
  kind: string;
  instanceId: string;
  displayName?: string;
  enabled: boolean;
  // secrets redacted; fields echoed back without encrypted values
  config: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export type ApiRequestOptions = {
  method?: string;
  headers?: unknown;
  body?: unknown;
  signal?: unknown;
};

/** Structured error carried on thrown Errors from API calls. The message
 *  preserves the original "CODE: detail" string; `code` is best-effort parsed
 *  from a leading `CODE:` prefix (e.g. `UNAUTHORIZED`, `VALIDATION`,
 *  `UNAVAILABLE`). Defaults to `UNKNOWN` when no prefix is present. */
export interface ApiErrorDetails {
  code: string;
  message: string;
}

const ERROR_CODE_RE = /^([A-Z][A-Z0-9_]{2,}):\s*(.+)$/;

export function parseApiErrorCode(message: string | undefined | null): ApiErrorDetails {
  const raw = (message ?? "").trim();
  const match = ERROR_CODE_RE.exec(raw);
  if (match && match[1] && match[2]) {
    return { code: match[1], message: match[2] };
  }
  return { code: "UNKNOWN", message: raw };
}
