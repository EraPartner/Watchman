import { describe, it, expect } from 'vitest';
import {
  isUnicast,
  parseNeighborOutput,
  filterLanHosts,
  createArpLookup,
  type NeighborRunner,
} from './arpLookup.js';

function fakeRunner(output: string, calls: Array<{ platform: NodeJS.Platform; timeoutMs: number }> = []): NeighborRunner {
  return {
    run: async (platform, timeoutMs) => {
      calls.push({ platform, timeoutMs });
      return output;
    },
  };
}

describe('isUnicast', () => {
  it('accepts normal unicast', () => {
    expect(isUnicast('192.168.1.10')).toBe(true);
    expect(isUnicast('10.0.0.1')).toBe(true);
  });
  it('rejects multicast 224-239', () => {
    expect(isUnicast('224.0.0.1')).toBe(false);
    expect(isUnicast('239.255.255.250')).toBe(false);
  });
  it('rejects link-local 169.254', () => {
    expect(isUnicast('169.254.1.1')).toBe(false);
  });
  it('rejects empty/malformed', () => {
    expect(isUnicast(null)).toBe(false);
    expect(isUnicast(undefined)).toBe(false);
    expect(isUnicast('')).toBe(false);
    expect(isUnicast('1.2.3')).toBe(false);
    expect(isUnicast('a.b.c.d')).toBe(false);
  });
});

describe('parseNeighborOutput linux', () => {
  it('parses REACHABLE and STALE entries', () => {
    const out = [
      '192.168.1.1 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE',
      '192.168.1.2 dev eth0 lladdr 11:22:33:44:55:66 STALE',
    ].join('\n');
    const hosts = parseNeighborOutput('linux', out);
    expect(hosts).toHaveLength(2);
    expect(hosts[0]).toEqual({ ip: '192.168.1.1', iface: 'eth0', mac: 'aa:bb:cc:dd:ee:ff' });
    expect(hosts[1]?.mac).toBe('11:22:33:44:55:66');
  });

  it('skips INCOMPLETE and FAILED', () => {
    const out = [
      '192.168.1.1 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE',
      '192.168.1.99 dev eth0  FAILED',
      '192.168.1.98 dev eth0  INCOMPLETE',
    ].join('\n');
    const hosts = parseNeighborOutput('linux', out);
    expect(hosts.map((h) => h.ip)).toEqual(['192.168.1.1']);
  });

  it('dedupes by ip', () => {
    const out = [
      '192.168.1.1 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE',
      '192.168.1.1 dev eth0 lladdr aa:bb:cc:dd:ee:ff STALE',
    ].join('\n');
    expect(parseNeighborOutput('linux', out)).toHaveLength(1);
  });
});

describe('parseNeighborOutput bsd', () => {
  it('parses primary arp -a format', () => {
    const out = '? (192.168.1.1) at aa:bb:cc:dd:ee:ff on en0 ifscope [ethernet]';
    const hosts = parseNeighborOutput('darwin', out);
    expect(hosts[0]).toEqual({ ip: '192.168.1.1', mac: 'aa:bb:cc:dd:ee:ff', iface: 'en0' });
  });

  it('skips incomplete', () => {
    const out = '? (192.168.1.99) at (incomplete) on en0';
    expect(parseNeighborOutput('darwin', out)).toHaveLength(0);
  });

  it('uses fallback regex without iface', () => {
    const out = 'host.local (192.168.1.5) at 11:22:33:44:55:66';
    const hosts = parseNeighborOutput('darwin', out);
    expect(hosts[0]?.ip).toBe('192.168.1.5');
    expect(hosts[0]?.iface).toBe(null);
  });
});

describe('filterLanHosts', () => {
  const hosts = [
    { ip: '192.168.1.1', mac: 'a', iface: 'eth0' },
    { ip: '192.168.1.2', mac: 'b', iface: 'eth0' },
    { ip: '192.168.1.3', mac: 'c', iface: 'wlan0' },
    { ip: '224.0.0.1', mac: 'd', iface: 'eth0' },
    { ip: '10.0.0.5', mac: 'e', iface: 'tun0' },
  ];

  it('returns [] when no serviceIp', () => {
    expect(filterLanHosts(hosts, undefined)).toEqual([]);
  });

  it('filters by matching iface when service known', () => {
    const lan = filterLanHosts(hosts, '192.168.1.1');
    expect(lan.map((h) => h.ip)).toEqual(['192.168.1.1', '192.168.1.2']);
  });

  it('falls back to /24 prefix when service not in arp', () => {
    const lan = filterLanHosts(hosts, '192.168.1.99');
    expect(lan.map((h) => h.ip).sort()).toEqual(['192.168.1.1', '192.168.1.2', '192.168.1.3']);
  });

  it('falls back to /16 when /24 empty', () => {
    const only16 = [
      { ip: '10.0.0.1', mac: 'a', iface: null },
      { ip: '10.0.5.2', mac: 'b', iface: null },
    ];
    const lan = filterLanHosts(only16, '10.0.9.9');
    expect(lan).toHaveLength(2);
  });
});

describe('createArpLookup', () => {
  it('composes runner output into result', async () => {
    const lookup = createArpLookup({
      runner: fakeRunner('192.168.1.1 dev eth0 lladdr aa:bb:cc:dd:ee:ff REACHABLE'),
    });
    const res = await lookup.lookup({ serviceIp: '192.168.1.1', platform: 'linux' });
    expect(res.hosts).toHaveLength(1);
    expect(res.lanHosts).toHaveLength(1);
    expect(res.note).toContain('192.168.1.1');
  });

  it('note reports no service host', async () => {
    const lookup = createArpLookup({ runner: fakeRunner('') });
    const res = await lookup.lookup({ platform: 'linux' });
    expect(res.note).toBe('No service host provided');
  });

  it('note reports no LAN hosts matched', async () => {
    const lookup = createArpLookup({ runner: fakeRunner('') });
    const res = await lookup.lookup({ serviceIp: '10.1.1.1', platform: 'linux' });
    expect(res.note).toContain('No LAN hosts matched');
  });

  it('passes timeout to runner', async () => {
    const calls: Array<{ platform: NodeJS.Platform; timeoutMs: number }> = [];
    const lookup = createArpLookup({ runner: fakeRunner('', calls), timeoutMs: 1234 });
    await lookup.lookup({ platform: 'linux' });
    expect(calls[0]).toEqual({ platform: 'linux', timeoutMs: 1234 });
  });
});
