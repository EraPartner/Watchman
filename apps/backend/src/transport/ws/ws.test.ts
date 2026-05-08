import { describe, it, expect } from 'vitest';
import { AuthGate } from './AuthGate.js';
import { ConnectionManager } from './ConnectionManager.js';
import { HeartbeatScheduler } from './HeartbeatScheduler.js';
import { Broadcaster } from './Broadcaster.js';
import { createEventBus } from '../../core/eventBus.js';
import { WS_OPEN, type WsClient } from './types.js';

interface FakeWsOpts {
  readyState?: number;
  onSend?: (s: string) => void;
  throwOnSend?: boolean;
  onPing?: () => void;
  throwOnPing?: boolean;
}

function fakeWs(opts: FakeWsOpts = {}): WsClient & { sent: string[]; terminated: boolean; closed: boolean } {
  const sent: string[] = [];
  let terminated = false;
  let closed = false;
  return {
    sent,
    get terminated() { return terminated; },
    get closed() { return closed; },
    readyState: opts.readyState ?? WS_OPEN,
    send(s: string) {
      if (opts.throwOnSend) throw new Error('send fail');
      sent.push(s);
      opts.onSend?.(s);
    },
    ping() {
      if (opts.throwOnPing) throw new Error('ping fail');
      opts.onPing?.();
    },
    terminate() { terminated = true; },
    close() { closed = true; },
    on() {},
  };
}

describe('AuthGate', () => {
  const normalizeOrigin = (o: string | undefined) => (o ? o.toLowerCase().replace(/\/$/, '') : null);

  it('allows when no origins configured', () => {
    const gate = new AuthGate({
      extractToken: () => 't',
      verifyToken: () => ({ username: 'u' }),
      allowedOrigins: new Set(),
      normalizeOrigin,
    });
    expect(gate.isOriginAllowed({ headers: {} })).toBe(true);
  });

  it('rejects missing origin when configured', () => {
    const gate = new AuthGate({
      extractToken: () => 't',
      verifyToken: () => ({ username: 'u' }),
      allowedOrigins: new Set(['https://app.example']),
      normalizeOrigin,
    });
    expect(gate.isOriginAllowed({ headers: {} })).toBe(false);
  });

  it('accepts allowed origin', () => {
    const gate = new AuthGate({
      extractToken: () => 't',
      verifyToken: () => ({ username: 'u' }),
      allowedOrigins: new Set(['https://app.example']),
      normalizeOrigin,
    });
    expect(gate.isOriginAllowed({ headers: { origin: 'https://app.example/' } })).toBe(true);
  });

  it('fails auth when token missing', () => {
    const gate = new AuthGate({
      extractToken: () => null,
      verifyToken: () => ({ username: 'u' }),
      allowedOrigins: new Set(),
      normalizeOrigin,
    });
    expect(gate.authenticate({ headers: {} })).toEqual({ ok: false, reason: 'No authentication token provided' });
  });

  it('fails auth when verify returns null', () => {
    const gate = new AuthGate({
      extractToken: () => 'bad',
      verifyToken: () => null,
      allowedOrigins: new Set(),
      normalizeOrigin,
    });
    const res = gate.authenticate({ headers: {} });
    expect(res.ok).toBe(false);
  });

  it('returns user with id from sub', () => {
    const gate = new AuthGate({
      extractToken: () => 't',
      verifyToken: () => ({ username: 'alice', sub: 'abc' }),
      allowedOrigins: new Set(),
      normalizeOrigin,
    });
    const res = gate.authenticate({ headers: {} });
    expect(res).toEqual({ ok: true, user: { username: 'alice', id: 'abc' } });
  });
});

describe('ConnectionManager', () => {
  it('adds and tracks per-ip count', () => {
    const cm = new ConnectionManager({ maxConnectionsPerIp: 2, now: () => 1 });
    const a = fakeWs();
    const b = fakeWs();
    expect(cm.add(a, '1.1.1.1', { username: 'u' }).ok).toBe(true);
    expect(cm.add(b, '1.1.1.1', { username: 'u' }).ok).toBe(true);
    const c = fakeWs();
    const res = cm.add(c, '1.1.1.1', { username: 'u' });
    expect(res).toEqual({ ok: false, reason: 'too_many_from_ip' });
    expect(cm.size()).toBe(2);
  });

  it('remove decrements ip count', () => {
    const cm = new ConnectionManager({ maxConnectionsPerIp: 1, now: () => 1 });
    const a = fakeWs();
    cm.add(a, '1.1.1.1', { username: 'u' });
    cm.remove(a);
    const b = fakeWs();
    expect(cm.add(b, '1.1.1.1', { username: 'u' }).ok).toBe(true);
  });

  it('openClients filters by readyState', () => {
    const cm = new ConnectionManager({ maxConnectionsPerIp: 5, now: () => 1 });
    const open = fakeWs({ readyState: WS_OPEN });
    const closing = fakeWs({ readyState: 2 });
    cm.add(open, 'a', { username: 'u' });
    cm.add(closing, 'b', { username: 'u' });
    expect(cm.openClients()).toEqual([open]);
  });

  it('markIdle/markAlive toggle', () => {
    const cm = new ConnectionManager({ maxConnectionsPerIp: 5, now: () => 1 });
    const a = fakeWs();
    cm.add(a, 'a', { username: 'u' });
    cm.markIdle(a);
    expect(cm.getMeta(a)?.alive).toBe(false);
    cm.markAlive(a);
    expect(cm.getMeta(a)?.alive).toBe(true);
  });
});

describe('HeartbeatScheduler', () => {
  function makeFakeTimer() {
    const ticks: Array<() => void> = [];
    return {
      setInterval: (fn: () => void) => { ticks.push(fn); return ticks.length; },
      clearInterval: () => { ticks.length = 0; },
      fire: () => ticks.forEach((f) => f()),
    };
  }

  it('terminates idle clients and pings alive ones', () => {
    const cm = new ConnectionManager({ maxConnectionsPerIp: 5, now: () => 1 });
    let pinged = 0;
    const alive = fakeWs({ onPing: () => pinged++ });
    const dead = fakeWs();
    cm.add(alive, 'a', { username: 'u' });
    cm.add(dead, 'b', { username: 'u' });
    cm.markIdle(dead);
    const timer = makeFakeTimer();
    const hb = new HeartbeatScheduler({
      intervalMs: 1000,
      manager: cm,
      setInterval: timer.setInterval,
      clearInterval: timer.clearInterval,
    });
    hb.start();
    timer.fire();
    expect(dead.terminated).toBe(true);
    expect(cm.size()).toBe(1);
    expect(pinged).toBe(1);
    expect(cm.getMeta(alive)?.alive).toBe(false);
  });

  it('start/stop idempotent', () => {
    const cm = new ConnectionManager({ maxConnectionsPerIp: 5, now: () => 1 });
    const timer = makeFakeTimer();
    const hb = new HeartbeatScheduler({
      intervalMs: 1000, manager: cm,
      setInterval: timer.setInterval, clearInterval: timer.clearInterval,
    });
    hb.start(); hb.start();
    hb.stop(); hb.stop();
  });

  it('captures ping errors via onError', () => {
    const cm = new ConnectionManager({ maxConnectionsPerIp: 5, now: () => 1 });
    const bad = fakeWs({ throwOnPing: true });
    cm.add(bad, 'a', { username: 'u' });
    const timer = makeFakeTimer();
    let err: unknown = null;
    const hb = new HeartbeatScheduler({
      intervalMs: 1000, manager: cm,
      setInterval: timer.setInterval, clearInterval: timer.clearInterval,
      onError: (e) => { err = e; },
    });
    hb.start();
    timer.fire();
    expect(err).toBeInstanceOf(Error);
  });
});

describe('Broadcaster', () => {
  it('fans out to open clients', () => {
    const cm = new ConnectionManager({ maxConnectionsPerIp: 5, now: () => 1 });
    const a = fakeWs();
    const b = fakeWs();
    cm.add(a, 'a', { username: 'u' });
    cm.add(b, 'b', { username: 'u' });
    const bus = createEventBus();
    const bc = new Broadcaster({ manager: cm, bus, now: () => 0 });
    const sent = bc.alert('info', 'hi');
    expect(sent).toBe(2);
    expect(a.sent.length).toBe(1);
    expect(JSON.parse(a.sent[0]!)).toMatchObject({ type: 'alert', level: 'info', message: 'hi' });
  });

  it('removes clients that fail to send', () => {
    const cm = new ConnectionManager({ maxConnectionsPerIp: 5, now: () => 1 });
    const good = fakeWs();
    const bad = fakeWs({ throwOnSend: true });
    cm.add(good, 'a', { username: 'u' });
    cm.add(bad, 'b', { username: 'u' });
    const bus = createEventBus();
    const bc = new Broadcaster({ manager: cm, bus, now: () => 0 });
    const sent = bc.alert('warning', 'x');
    expect(sent).toBe(1);
    expect(cm.size()).toBe(1);
  });

  it('bridges eventBus to websocket', () => {
    const cm = new ConnectionManager({ maxConnectionsPerIp: 5, now: () => 1 });
    const a = fakeWs();
    cm.add(a, 'a', { username: 'u' });
    const bus = createEventBus();
    const bc = new Broadcaster({ manager: cm, bus, now: () => 0 });
    bc.start();
    bus.emit('service.health.updated', { id: 'bitcoin:main', kind: 'bitcoin', instanceId: 'main', at: 123 });
    expect(a.sent.length).toBe(1);
    const msg = JSON.parse(a.sent[0]!);
    expect(msg).toMatchObject({ type: 'service_update', scope: 'health', id: 'bitcoin:main' });
    bc.stop();
    bus.emit('service.stats.updated', { id: 'x', kind: 'x', instanceId: 'main', at: 1 });
    expect(a.sent.length).toBe(1);
  });

  it('includes snapshot in health broadcast when present', () => {
    const cm = new ConnectionManager({ maxConnectionsPerIp: 5, now: () => 1 });
    const a = fakeWs();
    cm.add(a, 'a', { username: 'u' });
    const bus = createEventBus();
    const bc = new Broadcaster({ manager: cm, bus, now: () => 0 });
    bc.start();
    const snap = {
      reachable: true,
      at: 123,
      host: { reachable: true, pingMs: 4 },
      service: { reachable: true, latencyMs: 10 },
    };
    bus.emit('service.health.updated', {
      id: 'tor:main', kind: 'tor', instanceId: 'main', at: 123, snapshot: snap,
    });
    const msg = JSON.parse(a.sent[0]!);
    expect(msg.snapshot).toMatchObject(snap);
    bc.stop();
  });

  it('omits snapshot key when health event has none', () => {
    const cm = new ConnectionManager({ maxConnectionsPerIp: 5, now: () => 1 });
    const a = fakeWs();
    cm.add(a, 'a', { username: 'u' });
    const bus = createEventBus();
    const bc = new Broadcaster({ manager: cm, bus, now: () => 0 });
    bc.start();
    bus.emit('service.health.updated', { id: 'tor:main', kind: 'tor', instanceId: 'main', at: 123 });
    const msg = JSON.parse(a.sent[0]!);
    expect('snapshot' in msg).toBe(false);
    bc.stop();
  });

  it('includes snapshot in stats broadcast when present', () => {
    const cm = new ConnectionManager({ maxConnectionsPerIp: 5, now: () => 1 });
    const a = fakeWs();
    cm.add(a, 'a', { username: 'u' });
    const bus = createEventBus();
    const bc = new Broadcaster({ manager: cm, bus, now: () => 0 });
    bc.start();
    const snap = { metrics: { blocks: 800_000 }, at: 456 };
    bus.emit('service.stats.updated', {
      id: 'bitcoin:main', kind: 'bitcoin', instanceId: 'main', at: 456, snapshot: snap,
    });
    const msg = JSON.parse(a.sent[0]!);
    expect(msg.snapshot).toMatchObject(snap);
    bc.stop();
  });

  it('welcome sends once', () => {
    const cm = new ConnectionManager({ maxConnectionsPerIp: 5, now: () => 1 });
    const a = fakeWs();
    cm.add(a, 'a', { username: 'u' });
    const bc = new Broadcaster({ manager: cm, bus: createEventBus(), now: () => 0 });
    bc.welcome(a, '1.2.3');
    expect(JSON.parse(a.sent[0]!)).toMatchObject({ type: 'connection', serverVersion: '1.2.3' });
  });
});
