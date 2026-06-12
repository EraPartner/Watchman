import { z } from "zod";

const PollPolicySchema = z.object({
  healthMs: z.number().int().positive().default(10_000),
  statsMs: z.number().int().positive().default(30_000),
  jitterRatio: z.number().min(0).max(1).default(0.1),
});

const BaseInstanceSchema = z.object({
  instanceId: z.string().min(1).default("main"),
  enabled: z.boolean().default(true),
  pollPolicy: PollPolicySchema.default({
    healthMs: 10_000,
    statsMs: 30_000,
    jitterRatio: 0.1,
  }),
  cacheTtlMs: z.number().int().positive().default(10_000),
  timeoutMs: z.number().int().positive().default(5_000),
});

export const IpfsInstanceSchema = BaseInstanceSchema.extend({
  kind: z.literal("ipfs"),
  apiUrl: z.string().url().default("http://127.0.0.1:5001"),
});

export const RouterInstanceSchema = BaseInstanceSchema.extend({
  kind: z.literal("router"),
  host: z.string().min(1),
  ports: z.array(z.number().int().positive()).default([]),
  pingCount: z.number().int().positive().default(1),
  snmpCommunity: z.string().optional(),
  interfaceFilter: z.array(z.string()).default([]),
});

export const PhilipsBridgeInstanceSchema = BaseInstanceSchema.extend({
  kind: z.literal("philipsBridge"),
  host: z.string().min(1),
  pingCount: z.number().int().positive().default(2),
  usePing: z.boolean().default(true),
  applicationKey: z.string().optional(),
  certHash: z.string().optional(),
});

export const RoonInstanceSchema = BaseInstanceSchema.extend({
  kind: z.literal("roon"),
  host: z.string().min(1),
  ports: z.array(z.number().int().positive()).default([9100]),
  pingCount: z.number().int().positive().default(2),
  usePing: z.boolean().default(true),
  apiPort: z.number().int().positive().default(9100),
  useRoonApi: z.boolean().default(false),
});

export const QbittorrentInstanceSchema = BaseInstanceSchema.extend({
  kind: z.literal("qbittorrent"),
  baseUrl: z.string().url().default("http://127.0.0.1:8069"),
  username: z.string().default("admin"),
  password: z.string().default(""),
});

export const AdGuardInstanceSchema = BaseInstanceSchema.extend({
  kind: z.literal("adguard"),
  baseUrl: z.string().url(),
  username: z.string().default(""),
  password: z.string().default(""),
});

export const AlbyHubInstanceSchema = BaseInstanceSchema.extend({
  kind: z.literal("albyHub"),
  baseUrl: z.string().url(),
  token: z.string().default(""),
  // When true (default for one release): probe candidate paths to discover endpoints.
  // When false: use deterministic NWC API paths (/api/info, /api/apps).
  // Deterministic NWC mode (2 requests/cycle) by default; legacy path
  // scanning only for hubs that don't expose the NWC API.
  legacyProbe: z.boolean().default(false),
});

export const HomebridgeInstanceSchema = BaseInstanceSchema.extend({
  kind: z.literal("homebridge"),
  baseUrl: z.string().url(),
  username: z.string().default(""),
  password: z.string().default(""),
  authToken: z.string().default(""),
  statusPath: z.string().default("/api/status/server-information"),
  versionPath: z.string().default("/api/status/homebridge-version"),
  loginPath: z.string().default("/api/auth/login"),
});

export const SynologyInstanceSchema = BaseInstanceSchema.extend({
  kind: z.literal("synology"),
  host: z.string().min(1),
  snmpUser: z.string().default(""),
  snmpAuthKey: z.string().default(""),
  snmpPrivKey: z.string().default(""),
  snmpAuthProtocol: z.enum(["SHA", "MD5"]).default("SHA"),
  snmpPrivProtocol: z.enum(["AES", "DES"]).default("AES"),
  dsmUrl: z.string().default(""),
  dsmAccount: z.string().default(""),
  dsmPassword: z.string().default(""),
});

export const MacMiniInstanceSchema = BaseInstanceSchema.extend({
  kind: z.literal("macMini"),
  host: z.string().min(1),
  sshUser: z.string().default(""),
  sshPort: z.number().int().positive().default(22),
  sshKeyPath: z.string().default(""),
  sshPassphrase: z.string().default(""),
  pingCount: z.number().int().positive().default(1),
});

export const RaspberryPiInstanceSchema = BaseInstanceSchema.extend({
  kind: z.literal("raspberryPi"),
  host: z.string().min(1),
  port: z.number().int().positive().default(8888),
  // Direct SSH to Pi (preferred path; uses SSH pool)
  sshUser: z.string().default(""),
  sshPort: z.number().int().positive().default(22),
  sshKeyPath: z.string().default(""),
  sshPassphrase: z.string().default(""),
  // Legacy macMini relay (used when direct SSH not configured)
  macMiniHost: z.string().default(""),
  macMiniSshPort: z.number().int().positive().default(22),
  macMiniSshUser: z.string().default(""),
  macMiniSshKeyPath: z.string().default(""),
  macMiniSshPassphrase: z.string().default(""),
  nodePath: z.string().default("/usr/local/bin/node"),
  rpiCliPath: z.string().default(""),
  pingCount: z.number().int().positive().default(1),
});

export const BitcoinInstanceSchema = BaseInstanceSchema.extend({
  kind: z.literal("bitcoin"),
  rpcUrl: z.string().url().default("http://127.0.0.1:8332"),
  rpcUser: z.string().default(""),
  rpcPassword: z.string().default(""),
  /** ZMQ endpoint for hashblock notifications, e.g. tcp://127.0.0.1:28332 */
  zmqHashblockEndpoint: z.string().default(""),
  /** ZMQ endpoint for rawtx notifications, e.g. tcp://127.0.0.1:28333 */
  zmqRawtxEndpoint: z.string().default(""),
});

export const TorInstanceSchema = BaseInstanceSchema.extend({
  kind: z.literal("tor"),
  relayNickname: z.string().default(""),
  onionooBaseUrl: z.string().url().default("https://onionoo.torproject.org"),
  host: z.string().default("127.0.0.1"),
  pingCount: z.number().int().positive().default(1),
  controlPort: z.number().int().min(1).max(65535).default(9051),
  controlPassword: z.string().default(""),
  cookieAuthFile: z.string().default(""),
  useControlPort: z.boolean().default(false),
});

export const ServiceInstanceSchema = z.discriminatedUnion("kind", [
  IpfsInstanceSchema,
  RouterInstanceSchema,
  PhilipsBridgeInstanceSchema,
  RoonInstanceSchema,
  QbittorrentInstanceSchema,
  AdGuardInstanceSchema,
  AlbyHubInstanceSchema,
  TorInstanceSchema,
  BitcoinInstanceSchema,
  MacMiniInstanceSchema,
  SynologyInstanceSchema,
  HomebridgeInstanceSchema,
  RaspberryPiInstanceSchema,
]);

export type IpfsInstance = z.infer<typeof IpfsInstanceSchema>;
export type RouterInstance = z.infer<typeof RouterInstanceSchema>;
export type PhilipsBridgeInstance = z.infer<typeof PhilipsBridgeInstanceSchema>;
export type RoonInstance = z.infer<typeof RoonInstanceSchema>;
export type QbittorrentInstance = z.infer<typeof QbittorrentInstanceSchema>;
export type AdGuardInstance = z.infer<typeof AdGuardInstanceSchema>;
export type AlbyHubInstance = z.infer<typeof AlbyHubInstanceSchema>;
export type TorInstance = z.infer<typeof TorInstanceSchema>;
export type BitcoinInstance = z.infer<typeof BitcoinInstanceSchema>;
export type MacMiniInstance = z.infer<typeof MacMiniInstanceSchema>;
export type SynologyInstance = z.infer<typeof SynologyInstanceSchema>;
export type HomebridgeInstance = z.infer<typeof HomebridgeInstanceSchema>;
export type RaspberryPiInstance = z.infer<typeof RaspberryPiInstanceSchema>;
export type ServiceInstance = z.infer<typeof ServiceInstanceSchema>;

export const ServicesConfigSchema = z.object({
  instances: z.array(ServiceInstanceSchema).default([]),
});

export type ServicesConfig = z.infer<typeof ServicesConfigSchema>;

export function loadServicesConfig(raw: unknown): ServicesConfig {
  return ServicesConfigSchema.parse(raw);
}
