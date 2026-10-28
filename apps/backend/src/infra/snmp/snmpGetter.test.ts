import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { SnmpWalkRequest, SnmpWalkRow } from './snmpGetter.js';
import { createSnmpGetter } from './snmpGetterImpl.js';

// ─── Fake net-snmp session ────────────────────────────────────────────────────

interface FakeVarbind {
  oid: string;
  type: number;
  value: Buffer | string | number;
}

interface FakeSession extends EventEmitter {
  get?(oids: string[], cb: (err: Error | null, varbinds: FakeVarbind[]) => void): void;
  subtree(
    oid: string,
    maxRepetitions: number,
    feedCb: (varbinds: FakeVarbind[]) => void,
    doneCb: (err: Error | null) => void,
  ): void;
  close(): void;
}

function makeVarbind(oid: string, value: string): FakeVarbind {
  return { oid, type: 4 /* OctetString */, value: Buffer.from(value, 'utf8') };
}

function makeSession(rows: FakeVarbind[], error?: Error): FakeSession {
  return Object.assign(new EventEmitter(), {
    subtree(
      _oid: string,
      _max: number,
      feedCb: (varbinds: FakeVarbind[]) => void,
      doneCb: (err: Error | null) => void,
    ) {
      if (error) { doneCb(error); return; }
      feedCb(rows);
      doneCb(null);
    },
    close: vi.fn(),
  });
}

// A session whose request never answers; the test drives it via emit('error').
function makeHangingSession(): FakeSession {
  return Object.assign(new EventEmitter(), {
    get: () => {},
    subtree: () => {},
    close: vi.fn(),
  });
}

// Patch the net-snmp module import in snmpGetterImpl before importing it.
// We use vi.mock at the top level of the file — but since snmpGetterImpl
// imports `snmp` at module level, we intercept via a factory override.
vi.mock('net-snmp', () => {
  const sessions: FakeSession[] = [];
  const mod = {
    _sessions: sessions,
    Version2c: 1,
    Version3: 3,
    AuthProtocols: { sha: 3, md5: 2 },
    PrivProtocols: { aes: 4, des: 1 },
    SecurityLevel: { authPriv: 3 },
    ObjectType: { OctetString: 4, Counter32: 65, Counter64: 70 },
    isVarbindError: () => false,
    createSession: vi.fn((_host: string, _community: string) => sessions[0]!),
    createV3Session: vi.fn((_host: string, _user: unknown) => sessions[0]!),
  };
  return { default: mod, ...mod };
});

import snmp from 'net-snmp';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function walkReq(overrides: Partial<SnmpWalkRequest> = {}): SnmpWalkRequest {
  return {
    host: '192.168.1.1',
    subtree: '1.3.6.1.2.1.2.2.1.2',
    v2c: { community: 'public' },
    timeoutMs: 1000,
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('SnmpGetter.walk (I1)', () => {
  it('walk() exists on SnmpGetter', () => {
    const getter = createSnmpGetter();
    expect(typeof getter.walk).toBe('function');
  });

  it('v2c walk returns rows from subtree', async () => {
    const rows: FakeVarbind[] = [
      makeVarbind('1.3.6.1.2.1.2.2.1.2.1', 'eth0'),
      makeVarbind('1.3.6.1.2.1.2.2.1.2.2', 'eth1'),
    ];
    (snmp as unknown as { _sessions: FakeSession[] })._sessions[0] = makeSession(rows);

    const getter = createSnmpGetter();
    const result = await getter.walk(walkReq());

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toEqual({ oid: '1.3.6.1.2.1.2.2.1.2.1', value: 'eth0' });
    expect(result.rows[1]).toEqual({ oid: '1.3.6.1.2.1.2.2.1.2.2', value: 'eth1' });
  });

  it('v2c walk uses createSession with community', async () => {
    (snmp as unknown as { _sessions: FakeSession[] })._sessions[0] = makeSession([]);
    vi.mocked(snmp.createSession).mockClear();

    const getter = createSnmpGetter();
    await getter.walk(walkReq({ v2c: { community: 'private' } }));

    expect(snmp.createSession).toHaveBeenCalledWith(
      '192.168.1.1',
      'private',
      expect.objectContaining({ version: 1 }),
    );
  });

  it('returns empty rows when subtree is empty', async () => {
    (snmp as unknown as { _sessions: FakeSession[] })._sessions[0] = makeSession([]);

    const getter = createSnmpGetter();
    const result = await getter.walk(walkReq());
    expect(result.rows).toHaveLength(0);
  });

  it('rejects on subtree error', async () => {
    (snmp as unknown as { _sessions: FakeSession[] })._sessions[0] = makeSession(
      [],
      new Error('SNMP timeout'),
    );

    const getter = createSnmpGetter();
    await expect(getter.walk(walkReq())).rejects.toThrow('snmp walk failed');
  });

  it('Counter64 Buffer values are decoded as unsigned big-endian integers', async () => {
    // net-snmp returns Counter64 as raw BER content bytes; lengths vary
    const rows: FakeVarbind[] = [
      { oid: '1.3.6.1.2.1.31.1.1.1.6.1', type: 70, value: Buffer.from([0x01, 0x00]) },
      { oid: '1.3.6.1.2.1.31.1.1.1.6.2', type: 70, value: Buffer.from([0x00, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]) },
      { oid: '1.3.6.1.2.1.31.1.1.1.6.3', type: 70, value: Buffer.from([0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00]) },
    ];
    (snmp as unknown as { _sessions: FakeSession[] })._sessions[0] = makeSession(rows);

    const getter = createSnmpGetter();
    const result = await getter.walk(walkReq());
    expect(result.rows.map((r) => r.value)).toEqual(['256', '18446744073709551615', '4294967296']);
  });

  it('integer varbind values are coerced to strings', async () => {
    const rows: FakeVarbind[] = [{ oid: '1.3.6.1.2.1.2.2.1.10.1', type: 65 /* Counter32 */, value: 12345 }];
    (snmp as unknown as { _sessions: FakeSession[] })._sessions[0] = makeSession(rows);

    const getter = createSnmpGetter();
    const result = await getter.walk(walkReq());
    expect(result.rows[0]).toEqual<SnmpWalkRow>({ oid: '1.3.6.1.2.1.2.2.1.10.1', value: '12345' });
  });
});

describe('SnmpGetter session errors and abort', () => {
  const v3 = { user: 'u', authKey: 'authkey12', privKey: 'privkey12' };

  it("a session 'error' event rejects the walk instead of crashing", async () => {
    const session = makeHangingSession();
    (snmp as unknown as { _sessions: FakeSession[] })._sessions[0] = session;
    const p = createSnmpGetter().walk(walkReq());
    // with no listener, EventEmitter#emit('error') throws (uncaught in net-snmp's
    // dgram handler); a listener must be present and settle the promise
    expect(() => session.emit('error', new Error('bad datagram'))).not.toThrow();
    await expect(p).rejects.toThrow('snmp walk failed: bad datagram');
    expect(session.close).toHaveBeenCalled();
  });

  it("a session 'error' event rejects the get instead of crashing", async () => {
    const session = makeHangingSession();
    (snmp as unknown as { _sessions: FakeSession[] })._sessions[0] = session;
    const p = createSnmpGetter().get({
      host: '192.168.1.1',
      oids: ['1.3.6.1.2.1.1.3.0'],
      credentials: v3,
      timeoutMs: 1000,
    });
    expect(() => session.emit('error', new Error('bad datagram'))).not.toThrow();
    await expect(p).rejects.toThrow('snmp get failed: bad datagram');
  });

  it('an already-aborted signal rejects without waiting for the timer', async () => {
    const session = makeHangingSession();
    (snmp as unknown as { _sessions: FakeSession[] })._sessions[0] = session;
    const ac = new AbortController();
    ac.abort();
    await expect(createSnmpGetter().walk(walkReq({ signal: ac.signal }))).rejects.toThrow(
      'snmp walk aborted',
    );
    expect(session.close).toHaveBeenCalled();
  });

  it('removes its abort listener once the walk settles', async () => {
    (snmp as unknown as { _sessions: FakeSession[] })._sessions[0] = makeSession([]);
    const ac = new AbortController();
    const remove = vi.spyOn(ac.signal, 'removeEventListener');
    await createSnmpGetter().walk(walkReq({ signal: ac.signal }));
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});
