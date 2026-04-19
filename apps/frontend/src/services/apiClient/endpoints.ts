import { ApiClientCore } from "./core";
import type {
  AggregatedEntry,
  BackendHealth,
  BackendVersion,
  ControlRequest,
  ControlResponse,
  HealthSnapshot,
  HistoryPayload,
  HistoryQueryParams,
  InstanceInfo,
  SetupStatus,
  StatsSnapshot,
} from "./types";

function appendInstance(url: string, instance?: string): string {
  if (!instance) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}instance=${encodeURIComponent(instance)}`;
}

export class ApiClientEndpoints {
  private core: ApiClientCore;

  constructor(core: ApiClientCore) {
    this.core = core;
  }

  async getHealth(): Promise<BackendHealth> {
    return this.core.request("/meta/health");
  }

  async getVersion(): Promise<BackendVersion> {
    return this.core.request("/meta/version");
  }

  async getAggregatedServices(): Promise<AggregatedEntry[]> {
    return this.core.request("/services");
  }

  async getServiceHealth(
    kind: string,
    instance?: string
  ): Promise<HealthSnapshot> {
    const base = `/services/${encodeURIComponent(kind)}/health`;
    return this.core.request(appendInstance(base, instance));
  }

  async getServiceStats(
    kind: string,
    instance?: string
  ): Promise<StatsSnapshot> {
    const base = `/services/${encodeURIComponent(kind)}/stats`;
    return this.core.request(appendInstance(base, instance));
  }

  async getServiceHistory(
    kind: string,
    params: HistoryQueryParams
  ): Promise<HistoryPayload> {
    const q = new URLSearchParams();
    q.set("metric", params.metric);
    q.set("from", String(params.from));
    q.set("to", String(params.to));
    if (params.instance) q.set("instance", params.instance);
    if (params.resolution) q.set("resolution", params.resolution);
    if (params.agg) q.set("agg", params.agg);
    if (params.limit != null) q.set("limit", String(params.limit));
    return this.core.request(
      `/services/${encodeURIComponent(kind)}/history?${q.toString()}`
    );
  }

  async controlService(
    kind: string,
    action: string,
    params?: Record<string, unknown>,
    instance?: string
  ): Promise<ControlResponse> {
    const base = `/services/${encodeURIComponent(kind)}/control`;
    const body: ControlRequest = params ? { action, params } : { action };
    return this.core.request(appendInstance(base, instance), {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    });
  }

  async getInstances(): Promise<InstanceInfo[]> {
    return this.core.request("/instances");
  }

  async getInstancesByKind(kind: string): Promise<InstanceInfo[]> {
    return this.core.request(`/instances/${encodeURIComponent(kind)}`);
  }

  async getKinds(): Promise<string[]> {
    return this.core.request("/kinds");
  }

  async getSetupStatus(): Promise<SetupStatus> {
    return this.core.request("/setup/status");
  }
}
