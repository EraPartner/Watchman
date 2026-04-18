export interface SnmpV3Credentials {
  user: string;
  authKey: string;
  privKey: string;
  authProtocol?: 'SHA' | 'MD5';
  privProtocol?: 'AES' | 'DES';
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

export interface SnmpGetter {
  get(req: SnmpGetRequest): Promise<SnmpGetResult>;
}
