import type { ServiceRegistry } from '../domain/ServiceRegistry.js';
import { ValidationError, type DomainError } from '../core/errors.js';
import type { Result } from '../core/result.js';
import { isControllable } from '../domain/BaseService.js';
import { err } from '../core/result.js';

export class ControlService {
  constructor(private readonly registry: ServiceRegistry) {}

  async run(kind: string, instanceId: string | undefined, action: string, signal: AbortSignal): Promise<Result<void, DomainError>> {
    const svc = this.registry.getByKind(kind, instanceId);
    if (!isControllable(svc)) {
      return err(new ValidationError(`service ${svc.id} does not support control actions`));
    }
    return svc.control(action, signal);
  }
}
