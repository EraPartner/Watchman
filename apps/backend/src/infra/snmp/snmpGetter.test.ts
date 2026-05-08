import { describe, it, expect, vi } from 'vitest';
import type { SnmpWalkRequest, SnmpWalkRow } from './snmpGetter.js';
import { createSnmpGetter } from './snmpGetterImpl.js';

// ─── Fake net-snmp session ────────────────────────────────────────────────────

interface FakeVarbind {
  oid: string;
  type: number;
  value: Buffer | string | number;
}

interface FakeSession {
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
  return {
    subtree(_oid, _max, feedCb, doneCb) {
      if (error) { doneCb(error); return; }
      feedCb(rows);
      doneCb(null);
    },
    close: vi.fn(),
  };
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

  it('integer varbind values are coerced to strings', async () => {
    const rows: FakeVarbind[] = [{ oid: '1.3.6.1.2.1.2.2.1.10.1', type: 65 /* Counter32 */, value: 12345 }];
    (snmp as unknown as { _sessions: FakeSession[] })._sessions[0] = makeSession(rows);

    const getter = createSnmpGetter();
    const result = await getter.walk(walkReq());
    expect(result.rows[0]).toEqual<SnmpWalkRow>({ oid: '1.3.6.1.2.1.2.2.1.10.1', value: '12345' });
  });
});
