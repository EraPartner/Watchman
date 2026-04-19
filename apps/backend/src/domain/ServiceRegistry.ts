import { NotFoundError } from '../core/errors.js';
import type { BaseService } from './BaseService.js';

export class ServiceRegistry {
  private readonly byId = new Map<string, BaseService>();
  private readonly byKind = new Map<string, BaseService[]>();

  register(svc: BaseService): void {
    if (this.byId.has(svc.id)) {
      throw new Error(`duplicate service id: ${svc.id}`);
    }
    this.byId.set(svc.id, svc);
    const list = this.byKind.get(svc.kind) ?? [];
    list.push(svc);
    this.byKind.set(svc.kind, list);
  }

  get(id: string): BaseService {
    const svc = this.byId.get(id);
    if (!svc) throw new NotFoundError(`service not found: ${id}`);
    return svc;
  }

  getByKind(kind: string, instanceId?: string): BaseService {
    const list = this.byKind.get(kind);
    if (!list || list.length === 0) throw new NotFoundError(`no instances for kind: ${kind}`);
    if (!instanceId) return list[0]!;
    const match = list.find((s) => s.instanceId === instanceId);
    if (!match) throw new NotFoundError(`instance not found: ${kind}:${instanceId}`);
    return match;
  }

  unregister(id: string): BaseService | undefined {
    const svc = this.byId.get(id);
    if (!svc) return undefined;
    this.byId.delete(id);
    const list = this.byKind.get(svc.kind);
    if (list) {
      const idx = list.indexOf(svc);
      if (idx >= 0) list.splice(idx, 1);
      if (list.length === 0) this.byKind.delete(svc.kind);
    }
    return svc;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  listKind(kind: string): readonly BaseService[] {
    return this.byKind.get(kind) ?? [];
  }

  all(): readonly BaseService[] {
    return [...this.byId.values()];
  }

  kinds(): readonly string[] {
    return [...this.byKind.keys()];
  }
}
