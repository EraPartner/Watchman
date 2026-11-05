import snmp, { type Session, type Varbind } from 'net-snmp';
import { TimeoutError, UnavailableError, UnauthorizedError } from '../../core/errors.js';
import type {
  SnmpGetRequest,
  SnmpGetResult,
  SnmpGetter,
  SnmpWalkRequest,
  SnmpWalkResult,
  SnmpWalkRow,
} from './snmpGetter.js';

function mapAuthProto(p?: 'SHA' | 'MD5'): number {
  return p === 'MD5' ? snmp.AuthProtocols.md5 : snmp.AuthProtocols.sha;
}

function mapPrivProto(p?: 'AES' | 'DES'): number {
  return p === 'DES' ? snmp.PrivProtocols.des : snmp.PrivProtocols.aes;
}

function varbindToString(vb: Varbind): string {
  if (vb.value == null) return '';
  if (Buffer.isBuffer(vb.value)) {
    // net-snmp hands Counter64 back as the raw big-endian BER content bytes
    // (variable length, possibly with a leading 0x00), not as a number
    if (vb.type === snmp.ObjectType.Counter64) return decodeUnsignedBE(vb.value);
    return vb.value.toString('utf8');
  }
  const v = vb.value;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'bigint' || typeof v === 'boolean') return v.toString();
  return JSON.stringify(v) ?? '';
}

function decodeUnsignedBE(buf: Buffer): string {
  let n = 0n;
  for (const byte of buf) n = (n << 8n) | BigInt(byte);
  return n.toString();
}

/**
 * Run one request on a net-snmp session and settle exactly once: on the
 * request's own callback, the outer timer, the caller's abort, or a session
 * 'error' event. net-snmp emits 'error' when an incoming datagram fails to
 * parse; with no listener that is an uncaught exception that kills the
 * process, so every session gets one.
 */
function runOnSession<T>(
  session: Session,
  op: 'get' | 'walk',
  timeoutMs: number,
  signal: AbortSignal | undefined,
  start: (done: (err: Error | null, value?: T) => void) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      try { session.close(); } catch { /* ignore */ }
      fn();
    };
    const timer = setTimeout(() => {
      settle(() => reject(new TimeoutError(`snmp ${op} timed out after ${timeoutMs}ms`)));
    }, timeoutMs + 500);
    const onAbort = (): void => {
      settle(() => reject(new TimeoutError(`snmp ${op} aborted`)));
    };
    session.on('error', (err: Error) => {
      settle(() => reject(new UnavailableError(`snmp ${op} failed: ${err.message}`)));
    });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener('abort', onAbort, { once: true });
    start((err, value) => {
      settle(() => {
        if (err) reject(new UnavailableError(`snmp ${op} failed: ${err.message}`));
        else resolve(value as T);
      });
    });
  });
}

/** A v2c session when a community is given, otherwise a v3 (authPriv) one. */
function walkSession(req: SnmpWalkRequest): Session {
  const options = { port: 161, timeout: req.timeoutMs, retries: 1 };
  if (req.v2c) {
    return snmp.createSession(req.host, req.v2c.community, { ...options, version: snmp.Version2c });
  }
  if (!req.v3) {
    throw new UnauthorizedError('snmp: walk needs v2c or v3 credentials');
  }
  return snmp.createV3Session(
    req.host,
    {
      name: req.v3.user,
      level: snmp.SecurityLevel.authPriv,
      authProtocol: mapAuthProto(req.v3.authProtocol),
      authKey: req.v3.authKey,
      privProtocol: mapPrivProto(req.v3.privProtocol),
      privKey: req.v3.privKey,
    },
    { ...options, version: snmp.Version3 },
  );
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

      return await runOnSession<SnmpGetResult>(session, 'get', req.timeoutMs, req.signal, (done) => {
        session.get([...req.oids], (err, varbinds) => {
          if (err) {
            done(err);
            return;
          }
          const values = varbinds.map((vb) => {
            if (snmp.isVarbindError(vb)) return '';
            return varbindToString(vb);
          });
          done(null, { values });
        });
      });
    },

    async walk(req: SnmpWalkRequest): Promise<SnmpWalkResult> {
      const session = walkSession(req);

      const collected: SnmpWalkRow[] = [];
      return await runOnSession<SnmpWalkResult>(session, 'walk', req.timeoutMs, req.signal, (done) => {
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
            if (err) done(err);
            else done(null, { rows: collected });
          },
        );
      });
    },
  };
}
