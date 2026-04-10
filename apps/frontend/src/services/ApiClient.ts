import { ApiClientCore } from "./apiClient/core";
import { ApiClientEndpoints } from "./apiClient/endpoints";

export type {
  AdGuardStats,
  ApiRequestOptions,
  AuthMeResponse,
  BitcoinStats,
  FrontendConfig,
  GenericServiceStats,
  HomebridgeAccessoriesResponse,
  HomebridgeBaseResponse,
  HomebridgeServerInformationResponse,
  HomebridgeVersionResponse,
  LoginResponse,
  LogoutResponse,
  PaginatedResponse,
  QBittorrentStats,
  RoonPortCheck,
  RoonStatus,
  RouterArpResponse,
  ServiceHealth,
  ServiceInstanceEntry,
  ServiceInstancesResponse,
  ServicesHealthResponse,
  TorRelay,
  UpdateInfo,
  UpdateService,
} from "./apiClient/types";

class ApiClient extends ApiClientEndpoints {
  constructor() {
    super(new ApiClientCore());
  }
}

export const apiClient = new ApiClient();
export { ApiClient };
