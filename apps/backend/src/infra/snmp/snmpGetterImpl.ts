import snmp from 'net-snmp';
import { TimeoutError, UnavailableError, UnauthorizedError } from '../../core/errors.js';
import type {
  SnmpGetRequest,
  SnmpGetResult,
  SnmpGetter,
  SnmpWalkRequest,
  SnmpWalkResult,
  SnmpWalkRow,
} from './snmpGetter.js';

interface Varbind {
  oid: string;
  type: number;
  value: unknown;
}

function mapAuthProto(p?: 'SHA' | 'MD5'): number {
  return p === 'MD5' ? snmp.AuthProtocols.md5 : snmp.AuthProtocols.sha;
}

function mapPrivProto(p?: 'AES' | 'DES'): number {
  return p === 'DES' ? snmp.PrivProtocols.des : snmp.PrivProtocols.aes;
}

function varbindToString(vb: Varbind): string {
  if (vb.value == null) return '';
  if (Buffer.isBuffer(vb.value)) return vb.value.toString('utf8');
  return String(vb.value);
}

export function createSnmpGetter(): SnmpGetter {
  return {
    async get(req: SnmpGetRequest): Promise<SnmpGetResult> {
      if (!req.credentials.user) {
        throw new UnauthorizedError('snmp: missing v3 user');
      }
      const user = {
        name: req.credentials.user,
        level: snmp.SecurityLevel.authPriv,
        authProtocol: mapAuthProto(req.credentials.authProtocol),
        authKey: req.credentials.authKey,
        privProtocol: mapPrivProto(req.credentials.privProtocol),
        privKey: req.credentials.privKey,
      };
      const options = {
        port: 161,
        version: snmp.Version3,
        timeout: req.timeoutMs,
        retries: 1,
      };
      const session = snmp.createV3Session(req.host, user, options);

      return await new Promise<SnmpGetResult>((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          try { session.close(); } catch { /* ignore */ }
          reject(new TimeoutError(`snmp get timed out after ${req.timeoutMs}ms`));
        }, req.timeoutMs + 500);

        const onAbort = (): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try { session.close(); } catch { /* ignore */ }
          reject(new TimeoutError('snmp get aborted'));
        };
        req.signal?.addEventListener('abort', onAbort, { once: true });

        session.get([...req.oids], (err: Error | null, varbinds: Varbind[]) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try { session.close(); } catch { /* ignore */ }
          if (err) {
            reject(new UnavailableError(`snmp get failed: ${err.message}`));
            return;
          }
          const values = varbinds.map((vb) => {
            if (snmp.isVarbindError(vb)) return '';
            return varbindToString(vb);
          });
          resolve({ values });
        });
      });
    },

    async walk(req: SnmpWalkRequest): Promise<SnmpWalkResult> {
      const session = req.v2c
        ? snmp.createSession(req.host, req.v2c.community, {
            port: 161,
            version: snmp.Version2c,
            timeout: req.timeoutMs,
            retries: 1,
          })
        : snmp.createV3Session(
            req.host,
            {
              name: req.v3!.user,
              level: snmp.SecurityLevel.authPriv,
              authProtocol: mapAuthProto(req.v3!.authProtocol),
              authKey: req.v3!.authKey,
              privProtocol: mapPrivProto(req.v3!.privProtocol),
              privKey: req.v3!.privKey,
            },
            { port: 161, version: snmp.Version3, timeout: req.timeoutMs, retries: 1 },
          );

      return await new Promise<SnmpWalkResult>((resolve, reject) => {
        let settled = false;
        const collected: SnmpWalkRow[] = [];

        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          try { session.close(); } catch { /* ignore */ }
          reject(new TimeoutError(`snmp walk timed out after ${req.timeoutMs}ms`));
        }, req.timeoutMs + 500);

        const onAbort = (): void => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          try { session.close(); } catch { /* ignore */ }
          reject(new TimeoutError('snmp walk aborted'));
        };
        req.signal?.addEventListener('abort', onAbort, { once: true });

        session.subtree(
          req.subtree,
          20,
          (varbinds: Varbind[]) => {
            for (const vb of varbinds) {
              if (!snmp.isVarbindError(vb)) {
                collected.push({ oid: vb.oid, value: varbindToString(vb) });
              }
            }
          },
          (err: Error | null) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try { session.close(); } catch { /* ignore */ }
            if (err) {
              reject(new UnavailableError(`snmp walk failed: ${err.message}`));
              return;
            }
            resolve({ rows: collected });
          },
        );
      });
    },
  };
}
