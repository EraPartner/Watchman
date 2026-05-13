import { describe, it, expect, vi, beforeEach } from 'vitest';
import pino from 'pino';
import { buildServer } from '../server.js';
import { ServiceRegistry } from '../../../domain/ServiceRegistry.js';
import { GetServiceStatus } from '../../../application/GetServiceStatus.js';
import { GetAggregatedHealth } from '../../../application/GetAggregatedHealth.js';
import { ControlService } from '../../../application/ControlService.js';
import { ListInstances } from '../../../application/ListInstances.js';
import { createMetricsRegistry } from '../../../core/metrics.js';
import { ok, err } from '../../../core/result.js';
import { UnavailableError } from '../../../core/errors.js';
import { BaseService, type HealthResult, type StatsResult, type PollPolicy } from '../../../domain/BaseService.js';
import type { ConfigStore, StoredService, RedactedService, AuditEntry, ExportBundle, ImportResult } from '../../../config/store/ConfigStore.js';
import type { ServiceLifecycle } from '../../../application/ServiceLifecycle.js';
import type { HttpClient } from '../../../infra/http/client.js';

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const NOW = new Date('2024-06-01T00:00:00Z');

function makeStoredService(overrides: Partial<StoredService> = {}): StoredService {
  return {
    id: 'svc-uuid-1',
    kind: 'bitcoin',
    instanceId: 'main',
    enabled: true,
    config: { kind: 'bitcoin', instanceId: 'main', enabled: true } as unknown as StoredService['config'],
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function makeRedacted(overrides: Partial<RedactedService> = {}): RedactedService {
  return {
    id: 'svc-uuid-1',
    kind: 'bitcoin',
    instanceId: 'main',
    enabled: true,
    config: { rpcUrl: 'http://127.0.0.1:8332' },
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

// ─── Fake store factory ───────────────────────────────────────────────────────

function makeFakeStore(overrides: Partial<ConfigStore> = {}): ConfigStore {
  return {
    loadAll: vi.fn(async () => []),
    get: vi.fn(async () => null),
    create: vi.fn(async () => makeStoredService()),
    update: vi.fn(async () => makeStoredService()),
    delete: vi.fn(async () => undefined),
    redact: vi.fn(() => makeRedacted()),
    listAudit: vi.fn(async () => []),
    writeAudit: vi.fn(async () => undefined),
    exportAll: vi.fn(async () => ({ version: 1 as const, exportedAt: NOW.toISOString(), payload: 'abc123' })),
    importBundle: vi.fn(async () => ({ imported: 1, updated: 0, skipped: 0, errors: [] })),
    ...overrides,
  };
}

// ─── App builder ─────────────────────────────────────────────────────────────

function makeApp(store: ConfigStore, registry = new ServiceRegistry()) {
  const logger = pino({ level: 'silent' });
  const fakeLifecycle: ServiceLifecycle = {
    start: vi.fn(),
    stop: vi.fn(),
    reloadAll: vi.fn(),
    applyCreate: vi.fn(),
    applyUpdate: vi.fn(),
    applyDelete: vi.fn(),
    idByStoredId: vi.fn(() => undefined),
  } as unknown as ServiceLifecycle;
  const fakeHttp = { send: async () => { throw new Error('not used'); } } as HttpClient;

  return buildServer({
    logger,
    services: {
      getStatus: new GetServiceStatus({ registry }),
      aggregated: new GetAggregatedHealth(registry),
      control: new ControlService(registry),
    },
    listInstances: new ListInstances(registry),
    metrics: createMetricsRegistry(),
    config: { store, lifecycle: fakeLifecycle, registry },
    setup: { store, http: fakeHttp },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GET /config/kinds', () => {
  it('returns all service kinds with metadata', async () => {
    const app = await makeApp(makeFakeStore());
    const res = await app.inject({ method: 'GET', url: '/config/kinds' });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: Array<{ kind: string; label: string; description: string }> };
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    const bitcoin = body.data.find((k) => k.kind === 'bitcoin');
    expect(bitcoin).toBeDefined();
    expect(bitcoin?.label).toBeTruthy();
  });
});

describe('GET /config/services', () => {
  it('returns empty array when store is empty', async () => {
    const store = makeFakeStore({ loadAll: vi.fn(async () => []) });
    const app = await makeApp(store);
    const res = await app.inject({ method: 'GET', url: '/config/services' });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: unknown[] }).data).toHaveLength(0);
  });

  it('returns redacted services', async () => {
    const stored = makeStoredService();
    const redacted = makeRedacted();
    const store = makeFakeStore({
      loadAll: vi.fn(async () => [stored]),
      redact: vi.fn(() => redacted),
    });
    const app = await makeApp(store);
    const res = await app.inject({ method: 'GET', url: '/config/services' });
    await app.close();

    expect(res.statusCode).toBe(200);
    const body = res.json() as { data: RedactedService[] };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.id).toBe('svc-uuid-1');
  });
});

describe('GET /config/services/:id', () => {
  it('returns 404 when service not found', async () => {
    const store = makeFakeStore({ get: vi.fn(async () => null) });
    const app = await makeApp(store);
    const res = await app.inject({ method: 'GET', url: '/config/services/missing-id' });
    await app.close();

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('returns redacted service when found', async () => {
    const stored = makeStoredService();
    const redacted = makeRedacted();
    const store = makeFakeStore({
      get: vi.fn(async () => stored),
      redact: vi.fn(() => redacted),
    });
    const app = await makeApp(store);
    const res = await app.inject({ method: 'GET', url: '/config/services/svc-uuid-1' });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: RedactedService }).data.id).toBe('svc-uuid-1');
  });
});

describe('POST /config/services', () => {
  it('returns 201 with created service', async () => {
    const stored = makeStoredService();
    const redacted = makeRedacted();
    const store = makeFakeStore({
      create: vi.fn(async () => stored),
      redact: vi.fn(() => redacted),
    });
    const app = await makeApp(store);
    const res = await app.inject({
      method: 'POST',
      url: '/config/services',
      payload: { kind: 'bitcoin', instanceId: 'main' },
    });
    await app.close();

    expect(res.statusCode).toBe(201);
    expect((res.json() as { data: RedactedService }).data.id).toBe('svc-uuid-1');
  });

  it('returns 400 on validation error', async () => {
    const store = makeFakeStore({
      create: vi.fn(async () => { throw new Error('invalid input: missing host'); }),
    });
    const app = await makeApp(store);
    const res = await app.inject({
      method: 'POST',
      url: '/config/services',
      payload: { kind: 'invalid' },
    });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION' } });
  });

  it('passes x-actor header to store.create', async () => {
    const createMock = vi.fn(async () => makeStoredService());
    const store = makeFakeStore({ create: createMock, redact: vi.fn(() => makeRedacted()) });
    const app = await makeApp(store);
    await app.inject({
      method: 'POST',
      url: '/config/services',
      headers: { 'x-actor': 'alice' },
      payload: {},
    });
    await app.close();

    expect(createMock).toHaveBeenCalledWith(expect.anything(), 'alice');
  });
});

describe('PUT /config/services/:id', () => {
  it('returns updated service on success', async () => {
    const stored = makeStoredService({ instanceId: 'updated' });
    const redacted = makeRedacted({ instanceId: 'updated' });
    const store = makeFakeStore({
      update: vi.fn(async () => stored),
      redact: vi.fn(() => redacted),
    });
    const app = await makeApp(store);
    const res = await app.inject({
      method: 'PUT',
      url: '/config/services/svc-uuid-1',
      payload: { kind: 'bitcoin', instanceId: 'updated' },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: RedactedService }).data.instanceId).toBe('updated');
  });

  it('returns 404 when service not found', async () => {
    const store = makeFakeStore({
      update: vi.fn(async () => { throw new Error('Not found: missing-id'); }),
    });
    const app = await makeApp(store);
    const res = await app.inject({
      method: 'PUT',
      url: '/config/services/missing-id',
      payload: {},
    });
    await app.close();

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('returns 400 on validation error', async () => {
    const store = makeFakeStore({
      update: vi.fn(async () => { throw new Error('invalid field'); }),
    });
    const app = await makeApp(store);
    const res = await app.inject({
      method: 'PUT',
      url: '/config/services/svc-uuid-1',
      payload: { kind: 'wrong' },
    });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION' } });
  });
});

describe('DELETE /config/services/:id', () => {
  it('returns 204 on successful delete', async () => {
    const store = makeFakeStore({ delete: vi.fn(async () => undefined) });
    const app = await makeApp(store);
    const res = await app.inject({ method: 'DELETE', url: '/config/services/svc-uuid-1' });
    await app.close();

    expect(res.statusCode).toBe(204);
  });

  it('passes x-actor header to store.delete', async () => {
    const deleteMock = vi.fn(async () => undefined);
    const store = makeFakeStore({ delete: deleteMock });
    const app = await makeApp(store);
    await app.inject({
      method: 'DELETE',
      url: '/config/services/svc-uuid-1',
      headers: { 'x-actor': 'bob' },
    });
    await app.close();

    expect(deleteMock).toHaveBeenCalledWith('svc-uuid-1', 'bob');
  });
});

describe('POST /config/services/:id/test', () => {
  class FakeSvc extends BaseService {
    readonly kind = 'bitcoin';
    readonly instanceId = 'main';
    readonly pollPolicy: PollPolicy = { healthMs: 1000, statsMs: 2000 };
    constructor(private readonly healthy = true) { super(); }
    async checkHealth(): Promise<HealthResult> {
      return this.healthy ? ok({ reachable: true, at: 1 }) : err(new UnavailableError('down'));
    }
    async getStats(): Promise<StatsResult> { return ok({ metrics: {}, at: 1 }); }
  }

  it('returns 404 when stored service is not found', async () => {
    const store = makeFakeStore({ get: vi.fn(async () => null) });
    const app = await makeApp(store);
    const res = await app.inject({ method: 'POST', url: '/config/services/no-id/test', payload: {} });
    await app.close();

    expect(res.statusCode).toBe(404);
  });

  it('returns 409 when service is not live in registry', async () => {
    const stored = makeStoredService();
    const fakeLifecycle: ServiceLifecycle = {
      idByStoredId: vi.fn(() => undefined),
    } as unknown as ServiceLifecycle;
    const store = makeFakeStore({ get: vi.fn(async () => stored) });
    const registry = new ServiceRegistry();
    const logger = pino({ level: 'silent' });
    const app = await buildServer({
      logger,
      services: {
        getStatus: new GetServiceStatus({ registry }),
        aggregated: new GetAggregatedHealth(registry),
        control: new ControlService(registry),
      },
      listInstances: new ListInstances(registry),
      metrics: createMetricsRegistry(),
      config: { store, lifecycle: fakeLifecycle, registry },
      setup: { store, http: { send: async () => { throw new Error(); } } as HttpClient },
    });
    const res = await app.inject({ method: 'POST', url: '/config/services/svc-uuid-1/test', payload: {} });
    await app.close();

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ error: { code: 'NOT_LIVE' } });
  });

  it('returns health check result when service is live', async () => {
    const svc = new FakeSvc(true);
    const registry = new ServiceRegistry();
    registry.register(svc);
    const svcId = `${svc.kind}:${svc.instanceId}`;
    const stored = makeStoredService({ id: 'svc-uuid-1' });
    const fakeLifecycle: ServiceLifecycle = {
      idByStoredId: vi.fn(() => svcId),
    } as unknown as ServiceLifecycle;
    const store = makeFakeStore({ get: vi.fn(async () => stored) });
    const logger = pino({ level: 'silent' });
    const app = await buildServer({
      logger,
      services: {
        getStatus: new GetServiceStatus({ registry }),
        aggregated: new GetAggregatedHealth(registry),
        control: new ControlService(registry),
      },
      listInstances: new ListInstances(registry),
      metrics: createMetricsRegistry(),
      config: { store, lifecycle: fakeLifecycle, registry },
      setup: { store, http: { send: async () => { throw new Error(); } } as HttpClient },
    });
    const res = await app.inject({ method: 'POST', url: '/config/services/svc-uuid-1/test', payload: {} });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: { ok: boolean } }).data.ok).toBe(true);
  });
});

describe('GET /config/export', () => {
  it('returns export bundle with Content-Disposition header', async () => {
    const bundle: ExportBundle = {
      version: 1,
      exportedAt: '2024-06-01T00:00:00.000Z',
      payload: 'base64payload',
    };
    const store = makeFakeStore({ exportAll: vi.fn(async () => bundle) });
    const app = await makeApp(store);
    const res = await app.inject({ method: 'GET', url: '/config/export' });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/watchman-config-.*\.json/);
    expect((res.json() as ExportBundle).payload).toBe('base64payload');
  });
});

describe('POST /config/import', () => {
  it('returns import result on success', async () => {
    const result: ImportResult = { imported: 2, updated: 1, skipped: 0, errors: [] };
    const store = makeFakeStore({ importBundle: vi.fn(async () => result) });
    const app = await makeApp(store);
    const res = await app.inject({
      method: 'POST',
      url: '/config/import',
      payload: { version: 1, exportedAt: '2024-06-01', payload: 'abc' },
    });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: ImportResult }).data.imported).toBe(2);
  });

  it('returns 400 on invalid bundle', async () => {
    const store = makeFakeStore({
      importBundle: vi.fn(async () => { throw new Error('Invalid bundle: unsupported version'); }),
    });
    const app = await makeApp(store);
    const res = await app.inject({
      method: 'POST',
      url: '/config/import',
      payload: { version: 999 },
    });
    await app.close();

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION' } });
  });
});

describe('GET /config/audit', () => {
  it('returns empty audit log', async () => {
    const store = makeFakeStore({ listAudit: vi.fn(async () => []) });
    const app = await makeApp(store);
    const res = await app.inject({ method: 'GET', url: '/config/audit' });
    await app.close();

    expect(res.statusCode).toBe(200);
    expect((res.json() as { data: unknown[] }).data).toHaveLength(0);
  });

  it('returns formatted audit entries', async () => {
    const entry: AuditEntry = {
      id: 1,
      ts: NOW,
      action: 'create',
      targetKind: 'bitcoin',
      targetId: 'svc-uuid-1',
      diff: { kind: 'bitcoin', instanceId: 'main' },
      actor: 'alice',
    };
    const store = makeFakeStore({ listAudit: vi.fn(async () => [entry]) });
    const app = await makeApp(store);
    const res = await app.inject({ method: 'GET', url: '/config/audit' });
    await app.close();

    const body = res.json() as { data: Array<{ action: string; actor: string }> };
    expect(body.data).toHaveLength(1);
    expect(body.data[0]?.action).toBe('create');
    expect(body.data[0]?.actor).toBe('alice');
  });

  it('respects limit query param', async () => {
    const listAuditMock = vi.fn(async () => []);
    const store = makeFakeStore({ listAudit: listAuditMock });
    const app = await makeApp(store);
    await app.inject({ method: 'GET', url: '/config/audit?limit=50' });
    await app.close();

    expect(listAuditMock).toHaveBeenCalledWith(50);
  });
});
