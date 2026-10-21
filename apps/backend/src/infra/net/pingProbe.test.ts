import { describe, it, expect } from 'vitest';
import { pingTarget, repliedToPing } from './pingProbe.js';

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
