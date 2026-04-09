export const queryKeys = {
  frontendConfig: () => ["frontend", "config"] as const,
  servicesHealth: () => ["services", "health"] as const,
  servicesInstances: () => ["services", "instances"] as const,
  metrics: () => ["metrics"] as const,

  servicePrefix: (serviceKey: string) => [serviceKey] as const,

  serviceStatus: (serviceKey: string, instanceId = serviceKey) =>
    [serviceKey, "status", instanceId] as const,
  serviceStats: (serviceKey: string, instanceId = serviceKey) =>
    [serviceKey, "stats", instanceId] as const,

  adguardFull: () => ["adguard", "full"] as const,
  torRelay: () => ["tor", "relay"] as const,
  serviceUpdates: (serviceKey: string) => [serviceKey, "updates"] as const,

  homebridgeServerInformation: (instanceId = "homebridge") =>
    ["homebridge", "server-information", instanceId] as const,
  homebridgeVersion: (instanceId = "homebridge") =>
    ["homebridge", "homebridge-version", instanceId] as const,
  homebridgeAccessories: (instanceId = "homebridge") =>
    ["homebridge", "accessories", instanceId] as const,

  routerArp: (serviceKey: string) => ["router", "arp", serviceKey] as const,
};
