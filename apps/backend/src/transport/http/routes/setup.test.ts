import { describe, it, expect, vi, beforeEach } from 'vitest';
import pino from 'pino';
import { buildServer } from '../server.js';
import { ServiceRegistry } from '../../../domain/ServiceRegistry.js';
import { GetServiceStatus } from '../../../application/GetServiceStatus.js';
import { GetAggregatedHealth } from '../../../application/GetAggregatedHealth.js';
import { ControlService } from '../../../application/ControlService.js';
import { ListInstances } from '../../../application/ListInstances.js';
import { createMetricsRegistry } from '../../../core/metrics.js';
import { ValidationError, UnavailableError } from '../../../core/errors.js';
import type { ConfigStore } from '../../../config/store/ConfigStore.js';
import type { ServiceLifecycle } from '../../../application/ServiceLifecycle.js';
import type { HttpClient } from '../../../infra/http/client.js';

// Mock pairBridge and probeCertFingerprint so the route tests don't do real TLS
vi.mock('../../../domain/services/philipsBridge/huePairing.js', () => ({
  pairBridge: vi.fn(),
}));
vi.mock('../../../infra/http/pinnedClient.js', () => ({
  createPinnedClient: vi.fn(),
  probeCertFingerprint: vi.fn(),
}));

import { pairBridge } from '../../../domain/services/philipsBridge/huePairing.js';

const CERT_HASH = 'aabbcc00' + '0'.repeat(56);

function makeApp() {
  const logger = pino({ level: 'silent' });
  const fakeStore = { loadAll: async () => [] } as unknown as ConfigStore;
  const fakeLifecycle = {} as ServiceLifecycle;
  const fakeHttp = { send: async () => { throw new Error('not used'); } } as HttpClient;
  const registry = new ServiceRegistry();
  return buildServer({
    logger,
    services: {
      getStatus: new GetServiceStatus({ registry }),
      aggregated: new GetAggregatedHealth(registry),
      control: new ControlService(registry),
    },
    listInstances: new ListInstances(registry),
    metrics: createMetricsRegistry(),
    config: { store: fakeStore, lifecycle: fakeLifecycle, registry },
    setup: { store: fakeStore, http: fakeHttp },
  });
}

describe('POST /setup/philips-bridge/pair', () => {
  beforeEach(() => {
    vi.mocked(pairBridge).mockReset();
  });

  it('returns 400 when host missing', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/setup/philips-bridge/pair',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'VALIDATION' } });
    await app.close();
  });

  it('returns 200 with applicationKey and certHash on success', async () => {
    vi.mocked(pairBridge).mockResolvedValue({ applicationKey: 'my-key', certHash: CERT_HASH });
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/setup/philips-bridge/pair',
      payload: { host: '192.168.1.50' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      data: { applicationKey: 'my-key', certHash: CERT_HASH },
    });
    await app.close();
  });

  it('returns 400 with LINK_BUTTON_NOT_PRESSED when ValidationError', async () => {
    vi.mocked(pairBridge).mockRejectedValue(
      new ValidationError('link button not pressed — press the physical button'),
    );
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/setup/philips-bridge/pair',
      payload: { host: '192.168.1.50' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'LINK_BUTTON_NOT_PRESSED' } });
    await app.close();
  });

  it('returns 503 with UNAVAILABLE when UnavailableError', async () => {
    vi.mocked(pairBridge).mockRejectedValue(new UnavailableError('bridge unreachable'));
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/setup/philips-bridge/pair',
      payload: { host: '192.168.1.50' },
    });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ error: { code: 'UNAVAILABLE' } });
    await app.close();
  });

  it('forwards custom timeoutMs to pairBridge', async () => {
    vi.mocked(pairBridge).mockResolvedValue({ applicationKey: 'k', certHash: CERT_HASH });
    const app = await makeApp();
    await app.inject({
      method: 'POST',
      url: '/setup/philips-bridge/pair',
      payload: { host: '192.168.1.50', timeoutMs: 3000 },
    });
    expect(vi.mocked(pairBridge)).toHaveBeenCalledWith(
      '192.168.1.50',
      expect.any(Object),
      3000,
    );
    await app.close();
  });
});
