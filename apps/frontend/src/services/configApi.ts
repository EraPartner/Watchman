import { sharedCore } from "./ApiClient";

export type FieldType =
  | "string"
  | "text"
  | "number"
  | "boolean"
  | "url"
  | "password"
  | "select"
  | "stringArray"
  | "numberArray";

export interface FieldMeta {
  name: string;
  label: string;
  type: FieldType;
  secret?: boolean;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: string[];
  default?: unknown;
}

export interface KindSchema {
  kind: string;
  label: string;
  description?: string;
  fields: FieldMeta[];
  secretFields: string[];
}

export interface ServiceInstance {
  id: string;
  kind: string;
  instanceId: string;
  enabled: boolean;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceInstanceInput {
  kind: string;
  instanceId: string;
  enabled: boolean;
  config?: Record<string, unknown>;
  pollPolicy?: Record<string, unknown>;
  cacheTtlMs?: number;
  timeoutMs?: number;
}

export interface TestConnectionResult {
  ok: boolean;
  latencyMs: number;
  snapshot?: unknown;
  error?: { code: string; message: string };
}

export interface AuditEntry {
  id: number;
  ts: string;
  action: "create" | "update" | "delete" | "import" | "export";
  targetKind: string;
  targetId: string;
  diff: Record<string, unknown>;
  actor: string | null;
}

export interface SetupStatus {
  needsSetup: boolean;
  serviceCount: number;
}

const BASE = "";

function jsonBody(payload: unknown): {
  method: "POST" | "PUT";
  body: string;
  headers: Record<string, string>;
} {
  return {
    method: "POST",
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json" },
  };
}

export const configApi = {
  async getSetupStatus(): Promise<SetupStatus> {
    return sharedCore.request(`${BASE}/setup/status`);
  },

  async getKinds(): Promise<KindSchema[]> {
    return sharedCore.request(`${BASE}/config/kinds`);
  },

  async listServices(): Promise<ServiceInstance[]> {
    return sharedCore.request(`${BASE}/config/services`);
  },

  async getService(id: string): Promise<ServiceInstance> {
    return sharedCore.request(`${BASE}/config/services/${encodeURIComponent(id)}`);
  },

  async createService(input: ServiceInstanceInput): Promise<ServiceInstance> {
    const { config, ...rest } = input;
    const body = { ...rest, ...(config ?? {}) };
    return sharedCore.request(`${BASE}/config/services`, jsonBody(body));
  },

  async updateService(
    id: string,
    input: Partial<ServiceInstanceInput>
  ): Promise<ServiceInstance> {
    const { config, ...rest } = input;
    const body = { ...rest, ...(config ?? {}) };
    return sharedCore.request(`${BASE}/config/services/${encodeURIComponent(id)}`, {
      ...jsonBody(body),
      method: "PUT",
    });
  },

  async deleteService(id: string): Promise<void> {
    await sharedCore.request(
      `${BASE}/config/services/${encodeURIComponent(id)}`,
      { method: "DELETE" }
    );
  },

  async testService(id: string): Promise<TestConnectionResult> {
    return sharedCore.request(
      `${BASE}/config/services/${encodeURIComponent(id)}/test`,
      { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } }
    );
  },

  async listAudit(limit = 100): Promise<AuditEntry[]> {
    return sharedCore.request(`${BASE}/config/audit?limit=${limit}`);
  },

  async exportConfig(): Promise<ExportBundle> {
    return sharedCore.request(`${BASE}/config/export`);
  },

  async importConfig(bundle: ExportBundle): Promise<ImportResult> {
    return sharedCore.request(`${BASE}/config/import`, jsonBody(bundle));
  },
};

export interface ExportBundle {
  version: 1;
  exportedAt: string;
  payload: string;
}

export interface ImportResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: Array<{ kind: string; instanceId: string; message: string }>;
}
