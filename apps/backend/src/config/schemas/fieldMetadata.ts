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
      { name: 'snmpVersion', label: 'SNMP version', type: 'select', options: ['v2c', 'v3'], default: 'v2c', help: 'SNMP version for metrics polling.' },
      { name: 'snmpCommunity', label: 'SNMP community', type: 'password', secret: true, placeholder: 'public', help: 'v2c community string (enables SNMP stats when set).' },
      { name: 'interfaceFilter', label: 'Interface filter', type: 'stringArray', help: 'Restrict interface stats to these names (e.g. eth0). Empty = all.' },
    ]),
    secretFields: ['snmpCommunity'],
  },
  philipsBridge: {
    kind: 'philipsBridge',
    label: 'Philips Hue Bridge',
    description: 'Philips Hue bridge via Hue API v2 with optional cert pinning.',
    schema: PhilipsBridgeInstanceSchema,
    fields: withCommon([
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'pingCount', label: 'Ping count', type: 'number', default: 2 },
      { name: 'usePing', label: 'Use ping', type: 'boolean', default: true },
      { name: 'applicationKey', label: 'Application key', type: 'password', secret: true, help: 'Hue API v2 application key (enables light stats).' },
      { name: 'certHash', label: 'Cert SHA-256', type: 'text', help: 'SHA-256 fingerprint of bridge TLS cert for pinning (hex or colon-hex).' },
    ]),
    secretFields: ['applicationKey'],
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
      { name: 'apiPort', label: 'API port', type: 'number', default: 9100 },
      { name: 'useRoonApi', label: 'Use Roon API', type: 'boolean', default: false },
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
    description: 'Alby Hub Lightning service. Probes legacy candidate paths by default; switch to NWC for deterministic /api/info + /api/apps polling.',
    schema: AlbyHubInstanceSchema,
    fields: withCommon([
      { name: 'baseUrl', label: 'Base URL', type: 'url', required: true },
      { name: 'token', label: 'API token', type: 'password', secret: true },
      {
        name: 'legacyProbe',
        label: 'Legacy probe mode',
        type: 'boolean',
        default: true,
        help: 'On: probe a list of candidate paths to discover endpoints (backward-compatible). Off: use deterministic NWC API (/api/info + /api/apps) for richer stats (connected, setupCompleted, backendType, appCount).',
      },
    ]),
    secretFields: ['token'],
  },
  tor: {
    kind: 'tor',
    label: 'Tor Relay',
    description: 'Tor relay via Onionoo (default) or local ControlPort with automatic Onionoo fallback when off-LAN.',
    schema: TorInstanceSchema,
    fields: withCommon([
      { name: 'relayNickname', label: 'Relay nickname', type: 'text', required: true },
      { name: 'onionooBaseUrl', label: 'Onionoo URL', type: 'url', default: 'https://onionoo.torproject.org' },
      {
        name: 'useControlPort',
        label: 'Use ControlPort (local relay)',
        type: 'boolean',
        default: false,
        help: 'Probe the relay via Tor ControlPort + ICMP. Falls back to Onionoo automatically when off-LAN.',
      },
      {
        name: 'host',
        label: 'Relay host',
        type: 'text',
        default: '127.0.0.1',
        help: 'IP/hostname of the relay (used for ICMP and ControlPort connection).',
      },
      {
        name: 'controlPort',
        label: 'ControlPort',
        type: 'number',
        default: 9051,
        help: 'TCP port for the Tor control protocol. Default 9051.',
      },
      {
        name: 'controlPassword',
        label: 'ControlPort password',
        type: 'password',
        secret: true,
        help: 'Plaintext password for ControlPort auth. Leave empty if using cookie auth or no auth.',
      },
      {
        name: 'cookieAuthFile',
        label: 'Cookie auth file',
        type: 'text',
        placeholder: '/var/lib/tor/control_auth_cookie',
        help: 'Path to Tor control_auth_cookie. Takes precedence over password when set.',
      },
      {
        name: 'pingCount',
        label: 'ICMP probe count',
        type: 'number',
        default: 1,
        help: 'Number of ICMP pings per health check.',
      },
    ]),
    secretFields: ['controlPassword'],
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
      { name: 'zmqHashblockEndpoint', label: 'ZMQ hashblock endpoint', type: 'url', placeholder: 'tcp://127.0.0.1:28332' },
      { name: 'zmqRawtxEndpoint', label: 'ZMQ rawtx endpoint', type: 'url', placeholder: 'tcp://127.0.0.1:28333' },
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
    description: 'Synology via SNMPv3 + optional DSM API.',
    schema: SynologyInstanceSchema,
    fields: withCommon([
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'snmpUser', label: 'SNMP user', type: 'text' },
      { name: 'snmpAuthKey', label: 'SNMP auth key', type: 'password', secret: true },
      { name: 'snmpPrivKey', label: 'SNMP priv key', type: 'password', secret: true },
      { name: 'snmpAuthProtocol', label: 'Auth protocol', type: 'select', options: ['SHA', 'MD5'], default: 'SHA' },
      { name: 'snmpPrivProtocol', label: 'Priv protocol', type: 'select', options: ['AES', 'DES'], default: 'AES' },
      { name: 'dsmUrl', label: 'DSM URL', type: 'url', help: 'Synology DSM URL for extended stats (e.g. https://nas.local:5001). Optional.' },
      { name: 'dsmAccount', label: 'DSM account', type: 'text' },
      { name: 'dsmPassword', label: 'DSM password', type: 'password', secret: true },
    ]),
    secretFields: ['snmpAuthKey', 'snmpPrivKey', 'dsmPassword'],
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
    ]),
    secretFields: ['password', 'authToken'],
  },
  raspberryPi: {
    kind: 'raspberryPi',
    label: 'Raspberry Pi',
    description: 'Raspberry Pi via pigpio + direct SSH or legacy Mac Mini relay.',
    schema: RaspberryPiInstanceSchema,
    fields: withCommon([
      { name: 'host', label: 'Host', type: 'text', required: true },
      { name: 'port', label: 'Agent port', type: 'number', default: 8888 },
      { name: 'sshUser', label: 'SSH user', type: 'text', help: 'Direct SSH to Pi (preferred). Enables vcgencmd + /proc stats.' },
      { name: 'sshPort', label: 'SSH port', type: 'number', default: 22 },
      { name: 'sshKeyPath', label: 'SSH key path', type: 'text' },
      { name: 'sshPassphrase', label: 'SSH passphrase', type: 'password', secret: true },
      { name: 'macMiniHost', label: 'Mac Mini host', type: 'text', help: 'Legacy relay. Used only when direct SSH not configured.' },
      { name: 'macMiniSshPort', label: 'Mac Mini SSH port', type: 'number', default: 22 },
      { name: 'macMiniSshUser', label: 'Mac Mini SSH user', type: 'text' },
      { name: 'macMiniSshKeyPath', label: 'Mac Mini SSH key path', type: 'text' },
      { name: 'macMiniSshPassphrase', label: 'Mac Mini SSH passphrase', type: 'password', secret: true },
      { name: 'nodePath', label: 'Node binary path', type: 'text', default: '/usr/local/bin/node' },
      { name: 'rpiCliPath', label: 'rpi CLI path', type: 'text' },
      { name: 'pingCount', label: 'Ping count', type: 'number', default: 1 },
    ]),
    secretFields: ['sshPassphrase', 'macMiniSshPassphrase'],
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
