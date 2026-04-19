import type { z } from 'zod';
import {
  AdGuardInstanceSchema,
  AlbyHubInstanceSchema,
  BitcoinInstanceSchema,
  HomebridgeInstanceSchema,
  IpfsInstanceSchema,
  MacMiniInstanceSchema,
  PhilipsBridgeInstanceSchema,
  QbittorrentInstanceSchema,
  RaspberryPiInstanceSchema,
  RoonInstanceSchema,
  RouterInstanceSchema,
  ServiceInstanceSchema,
  SynologyInstanceSchema,
  TorInstanceSchema,
} from '../services.js';

export type ServiceKind =
  | 'ipfs'
  | 'router'
  | 'philipsBridge'
  | 'roon'
  | 'qbittorrent'
  | 'adguard'
  | 'albyHub'
  | 'tor'
  | 'bitcoin'
  | 'macMini'
  | 'synology'
  | 'homebridge'
  | 'raspberryPi';

export type FieldType =
  | 'text'
  | 'password'
  | 'number'
  | 'url'
  | 'boolean'
  | 'select'
  | 'stringArray'
  | 'numberArray';

export interface FieldMeta {
  name: string;
  label: string;
  type: FieldType;
  secret?: boolean;
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: ReadonlyArray<string>;
  default?: unknown;
}

export interface KindMeta {
  kind: ServiceKind;
  label: string;
  description: string;
  schema: z.ZodTypeAny;
  fields: ReadonlyArray<FieldMeta>;
  secretFields: ReadonlyArray<string>;
}

const COMMON_FIELDS: ReadonlyArray<FieldMeta> = [
  { name: 'instanceId', label: 'Instance ID', type: 'text', required: true, default: 'main', help: 'Unique identifier for this instance within the kind.' },
  { name: 'enabled', label: 'Enabled', type: 'boolean', default: true },
  { name: 'cacheTtlMs', label: 'Cache TTL (ms)', type: 'number', default: 10_000 },
  { name: 'timeoutMs', label: 'Timeout (ms)', type: 'number', default: 5_000 },
];

function withCommon(fields: ReadonlyArray<FieldMeta>): ReadonlyArray<FieldMeta> {
  return [...COMMON_FIELDS, ...fields];
}

export const KIND_META: Record<ServiceKind, KindMeta> = {
  ipfs: {
    kind: 'ipfs',
    label: 'IPFS',
    description: 'IPFS node via HTTP API.',
    schema: IpfsInstanceSchema,
    fields: withCommon([
      { name: 'apiUrl', label: 'API URL', type: 'url', required: true, default: 'http://127.0.0.1:5001' },
      { name: 'forcePost', label: 'Force POST', type: 'boolean', default: false },
    ]),
    secretFields: [],
  },
  router: {
    kind: 'router',
    label: 'Router',
    description: 'Network router reachable via ping/port probe.',
    schema: RouterInstanceSchema,
    fields: withCommon([
      { name: 'host', label: 'Host', type: 'text', required: true, placeholder: '192.168.1.1' },
      { name: 'ports', label: 'Ports', type: 'numberArray', help: 'Optional list of TCP ports to probe.' },
      { name: 'pingCount', label: 'Ping count', type: 'number', default: 1 },
    ]),
    secretFields: [],
  },
  philipsBridge: {
    kind: 'philipsBridge',
    label: 'Philips Hue Bridge',
    description: 'Philips Hue bridge reachability.',
    schema: PhilipsBridgeInstanceSchema,
    fields: withCommon([
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'pingCount', label: 'Ping count', type: 'number', default: 2 },
      { name: 'usePing', label: 'Use ping', type: 'boolean', default: true },
    ]),
    secretFields: [],
  },
  roon: {
    kind: 'roon',
    label: 'Roon',
    description: 'Roon core reachability.',
    schema: RoonInstanceSchema,
    fields: withCommon([
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'ports', label: 'Ports', type: 'numberArray', default: [9100] },
      { name: 'pingCount', label: 'Ping count', type: 'number', default: 2 },
      { name: 'usePing', label: 'Use ping', type: 'boolean', default: true },
    ]),
    secretFields: [],
  },
  qbittorrent: {
    kind: 'qbittorrent',
    label: 'qBittorrent',
    description: 'qBittorrent Web UI.',
    schema: QbittorrentInstanceSchema,
    fields: withCommon([
      { name: 'baseUrl', label: 'Base URL', type: 'url', required: true, default: 'http://127.0.0.1:8069' },
      { name: 'username', label: 'Username', type: 'text', default: 'admin' },
      { name: 'password', label: 'Password', type: 'password', secret: true },
    ]),
    secretFields: ['password'],
  },
  adguard: {
    kind: 'adguard',
    label: 'AdGuard Home',
    description: 'AdGuard Home DNS filter.',
    schema: AdGuardInstanceSchema,
    fields: withCommon([
      { name: 'baseUrl', label: 'Base URL', type: 'url', required: true },
      { name: 'username', label: 'Username', type: 'text' },
      { name: 'password', label: 'Password', type: 'password', secret: true },
    ]),
    secretFields: ['password'],
  },
  albyHub: {
    kind: 'albyHub',
    label: 'Alby Hub',
    description: 'Alby Hub Lightning service.',
    schema: AlbyHubInstanceSchema,
    fields: withCommon([
      { name: 'baseUrl', label: 'Base URL', type: 'url', required: true },
      { name: 'token', label: 'API token', type: 'password', secret: true },
    ]),
    secretFields: ['token'],
  },
  tor: {
    kind: 'tor',
    label: 'Tor Relay',
    description: 'Tor relay via Onionoo.',
    schema: TorInstanceSchema,
    fields: withCommon([
      { name: 'relayNickname', label: 'Relay nickname', type: 'text', required: true },
      { name: 'onionooBaseUrl', label: 'Onionoo URL', type: 'url', default: 'https://onionoo.torproject.org' },
    ]),
    secretFields: [],
  },
  bitcoin: {
    kind: 'bitcoin',
    label: 'Bitcoin Node',
    description: 'Bitcoin Core JSON-RPC.',
    schema: BitcoinInstanceSchema,
    fields: withCommon([
      { name: 'rpcUrl', label: 'RPC URL', type: 'url', required: true, default: 'http://127.0.0.1:8332' },
      { name: 'rpcUser', label: 'RPC user', type: 'text' },
      { name: 'rpcPassword', label: 'RPC password', type: 'password', secret: true },
    ]),
    secretFields: ['rpcPassword'],
  },
  macMini: {
    kind: 'macMini',
    label: 'Mac Mini',
    description: 'Mac Mini host via SSH.',
    schema: MacMiniInstanceSchema,
    fields: withCommon([
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'sshUser', label: 'SSH user', type: 'text' },
      { name: 'sshPort', label: 'SSH port', type: 'number', default: 22 },
      { name: 'sshKeyPath', label: 'SSH key path', type: 'text' },
      { name: 'sshPassphrase', label: 'SSH passphrase', type: 'password', secret: true },
      { name: 'pingCount', label: 'Ping count', type: 'number', default: 1 },
    ]),
    secretFields: ['sshPassphrase'],
  },
  synology: {
    kind: 'synology',
    label: 'Synology NAS',
    description: 'Synology via SNMPv3.',
    schema: SynologyInstanceSchema,
    fields: withCommon([
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'snmpUser', label: 'SNMP user', type: 'text' },
      { name: 'snmpAuthKey', label: 'SNMP auth key', type: 'password', secret: true },
      { name: 'snmpPrivKey', label: 'SNMP priv key', type: 'password', secret: true },
      { name: 'snmpAuthProtocol', label: 'Auth protocol', type: 'select', options: ['SHA', 'MD5'], default: 'SHA' },
      { name: 'snmpPrivProtocol', label: 'Priv protocol', type: 'select', options: ['AES', 'DES'], default: 'AES' },
    ]),
    secretFields: ['snmpAuthKey', 'snmpPrivKey'],
  },
  homebridge: {
    kind: 'homebridge',
    label: 'Homebridge',
    description: 'Homebridge UI + API.',
    schema: HomebridgeInstanceSchema,
    fields: withCommon([
      { name: 'baseUrl', label: 'Base URL', type: 'url', required: true },
      { name: 'username', label: 'Username', type: 'text' },
      { name: 'password', label: 'Password', type: 'password', secret: true },
      { name: 'authToken', label: 'Auth token', type: 'password', secret: true },
      { name: 'statusPath', label: 'Status path', type: 'text', default: '/api/status/server-information' },
      { name: 'versionPath', label: 'Version path', type: 'text', default: '/api/status/homebridge-version' },
      { name: 'loginPath', label: 'Login path', type: 'text', default: '/api/auth/login' },
      { name: 'accessoriesPath', label: 'Accessories path', type: 'text', default: '/accessories' },
    ]),
    secretFields: ['password', 'authToken'],
  },
  raspberryPi: {
    kind: 'raspberryPi',
    label: 'Raspberry Pi',
    description: 'Raspberry Pi via companion agent, optional SSH through Mac Mini.',
    schema: RaspberryPiInstanceSchema,
    fields: withCommon([
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Agent port', type: 'number', default: 8888 },
      { name: 'macMiniHost', label: 'Mac Mini host', type: 'text' },
      { name: 'macMiniSshPort', label: 'Mac Mini SSH port', type: 'number', default: 22 },
      { name: 'macMiniSshUser', label: 'Mac Mini SSH user', type: 'text' },
      { name: 'macMiniSshKeyPath', label: 'Mac Mini SSH key path', type: 'text' },
      { name: 'macMiniSshPassphrase', label: 'Mac Mini SSH passphrase', type: 'password', secret: true },
      { name: 'nodePath', label: 'Node binary path', type: 'text', default: '/usr/local/bin/node' },
      { name: 'rpiCliPath', label: 'rpi CLI path', type: 'text' },
      { name: 'pingCount', label: 'Ping count', type: 'number', default: 1 },
    ]),
    secretFields: ['macMiniSshPassphrase'],
  },
};

export const SERVICE_KINDS: ReadonlyArray<ServiceKind> = Object.keys(KIND_META) as ServiceKind[];

export function getKindMeta(kind: string): KindMeta | undefined {
  return KIND_META[kind as ServiceKind];
}

export function isServiceKind(kind: string): kind is ServiceKind {
  return kind in KIND_META;
}

export function getSecretFields(kind: ServiceKind): ReadonlyArray<string> {
  return KIND_META[kind].secretFields;
}

export { ServiceInstanceSchema };
