export interface SnmpV3Credentials {
  user: string;
  authKey: string;
  privKey: string;
  authProtocol?: 'SHA' | 'MD5';
  privProtocol?: 'AES' | 'DES';
}

export interface SnmpV2cCredentials {
  community: string;
}

export interface SnmpGetRequest {
  host: string;
  oids: readonly string[];
  credentials: SnmpV3Credentials;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface SnmpGetResult {
  values: readonly string[];
}

export interface SnmpWalkRequest {
  host: string;
  subtree: string;
  /** Provide exactly one of v2c or v3. */
  v2c?: SnmpV2cCredentials;
  v3?: SnmpV3Credentials;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface SnmpWalkRow {
  oid: string;
  value: string;
}

export interface SnmpWalkResult {
  rows: readonly SnmpWalkRow[];
}

export interface SnmpGetter {
  get(req: SnmpGetRequest): Promise<SnmpGetResult>;
  walk(req: SnmpWalkRequest): Promise<SnmpWalkResult>;
}
