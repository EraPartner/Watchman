import { ApiClientCore } from "./apiClient/core";
import { ApiClientEndpoints } from "./apiClient/endpoints";

export type {
  AggregatedEntry,
  AggregatedResult,
  ApiRequestOptions,
  BackendHealth,
  BackendVersion,
  ControlRequest,
  ControlResponse,
  HealthSnapshot,
  HistoryPayload,
  HistoryPoint,
  HistoryQueryParams,
  HistoryResolution,
  InstanceInfo,
  SetupStatus,
  StatsMetricValue,
  StatsSnapshot,
} from "./apiClient/types";

const sharedCore = new ApiClientCore();

class ApiClient extends ApiClientEndpoints {
  constructor() {
    super(sharedCore);
  }
}

export const apiClient = new ApiClient();
export { ApiClient, sharedCore };
