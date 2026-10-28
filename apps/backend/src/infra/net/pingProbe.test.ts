import { describe, it, expect } from 'vitest';
import { hasReplyLine, parseAvg, pingCountFor, pingTarget, repliedToPing } from './pingProbe.js';

const linux = (loss: string) =>
  `4 packets transmitted, 2 received, ${loss} packet loss, time 3004ms\nrtt min/avg/max/mdev = 0.1/0.2/0.3/0.04 ms\n`;
const mac = (loss: string) =>
  `4 packets transmitted, 2 packets received, ${loss} packet loss\nround-trip min/avg/max/stddev = 0.1/0.2/0.3/0.04 ms\n`;

describe('repliedToPing', () => {
  it('treats any partial loss as reachable, regardless of the digits', () => {
    // regression: the old /0% packet loss/ test matched 50% and 10% but not 25%
    for (const loss of ['0%', '10%', '25%', '50%', '75%']) expect(repliedToPing(linux(loss))).toBe(true);
    for (const loss of ['0.0%', '25.0%', '50.0%']) expect(repliedToPing(mac(loss))).toBe(true);
  });

  it('treats 100% loss as unreachable', () => {
    expect(repliedToPing(linux('100%'))).toBe(false);
    expect(repliedToPing(mac('100.0%'))).toBe(false);
  });
});

describe('pingTarget', () => {
  it('strips the brackets URL.hostname keeps on IPv6 literals', () => {
    expect(pingTarget(new URL('http://[fe80::1]:8332').hostname)).toBe('fe80::1');
  });

  it('leaves IPv4 addresses and hostnames alone', () => {
    expect(pingTarget('192.168.1.5')).toBe('192.168.1.5');
    expect(pingTarget('node.local')).toBe('node.local');
  });
});

describe('pingCountFor', () => {
  it('clamps the count so one-second echoes fit in the timeout', () => {
    // regression: pingCount 8 with a 5 s timeout ran ~7 s and was killed
    expect(pingCountFor(8, 5_000)).toBe(5);
    expect(pingCountFor(3, 5_000)).toBe(3);
    expect(pingCountFor(20, 2_000)).toBe(2);
  });

  it('always sends at least one echo', () => {
    expect(pingCountFor(1, 500)).toBe(1);
    expect(pingCountFor(0, 5_000)).toBe(1);
  });
});

describe('output of a ping that was killed before its summary', () => {
  const partialLinux =
    'PING 10.0.0.1 (10.0.0.1) 56(84) bytes of data.\n64 bytes from 10.0.0.1: icmp_seq=1 ttl=64 time=1.20 ms\n64 bytes from 10.0.0.1: icmp_seq=2 ttl=64 time=0.80 ms\n';
  const partialMac =
    'PING 10.0.0.1 (10.0.0.1): 56 data bytes\n64 bytes from 10.0.0.1: icmp_seq=0 ttl=64 time=2.000 ms\n';

  it('counts a reply line as reachable', () => {
    expect(hasReplyLine(partialLinux)).toBe(true);
    expect(hasReplyLine(partialMac)).toBe(true);
    expect(repliedToPing(partialLinux)).toBe(true);
  });

  it('does not count the header line alone', () => {
    expect(hasReplyLine('PING 10.0.0.1 (10.0.0.1) 56(84) bytes of data.\n')).toBe(false);
  });

  it('averages per-reply times when there is no summary line', () => {
    expect(parseAvg(partialLinux)).toBeCloseTo(1.0);
    expect(parseAvg(partialMac)).toBeCloseTo(2.0);
  });

  it('still prefers the summary average when present', () => {
    expect(parseAvg(linux('0%'))).toBe(0.2);
  });
});

