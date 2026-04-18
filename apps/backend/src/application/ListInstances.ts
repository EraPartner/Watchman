import type { ServiceRegistry } from '../domain/ServiceRegistry.js';

export interface InstanceInfo {
  id: string;
  kind: string;
  instanceId: string;
}

export class ListInstances {
  constructor(private readonly registry: ServiceRegistry) {}

  byKind(kind: string): readonly InstanceInfo[] {
    return this.registry.listKind(kind).map((s) => ({ id: s.id, kind: s.kind, instanceId: s.instanceId }));
  }

  all(): readonly InstanceInfo[] {
    return this.registry.all().map((s) => ({ id: s.id, kind: s.kind, instanceId: s.instanceId }));
  }

  kinds(): readonly string[] {
    return this.registry.kinds();
  }
}
