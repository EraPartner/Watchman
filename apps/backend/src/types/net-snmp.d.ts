/**
 * The part of net-snmp (which ships no types) that snmpGetterImpl uses.
 * Shapes follow the net-snmp README for v3.x.
 */
declare module 'net-snmp' {
  export interface Varbind {
    oid: string;
    type: number;
    value: unknown;
  }

  export interface SessionOptions {
    port?: number;
    version?: number;
    timeout?: number;
    retries?: number;
  }

  export interface V3User {
    name: string;
    level: number;
    authProtocol?: number;
    authKey?: string;
    privProtocol?: number;
    privKey?: string;
  }

  export interface Session {
    get(
      oids: string[],
      callback: (err: Error | null, varbinds: Varbind[]) => void,
    ): void;
    subtree(
      oid: string,
      maxRepetitions: number,
      feedCallback: (varbinds: Varbind[]) => void,
      doneCallback: (err: Error | null) => void,
    ): void;
    close(): void;
    on(event: 'error', listener: (err: Error) => void): unknown;
  }

  interface NetSnmp {
    Version2c: number;
    Version3: number;
    SecurityLevel: { noAuthNoPriv: number; authNoPriv: number; authPriv: number };
    AuthProtocols: { md5: number; sha: number };
    PrivProtocols: { des: number; aes: number };
    ObjectType: { Counter64: number };
    // Property signatures: these are plain module functions, not methods
    // that depend on `this`.
    createSession: (target: string, community: string, options?: SessionOptions) => Session;
    createV3Session: (target: string, user: V3User, options?: SessionOptions) => Session;
    isVarbindError: (varbind: Varbind) => boolean;
  }

  const snmp: NetSnmp;
  export default snmp;
}
