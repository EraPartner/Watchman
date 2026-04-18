import type { Result } from '../core/result.js';
import type { DomainError } from '../core/errors.js';

export interface PollPolicy {
  healthMs: number;
  statsMs: number;
  jitterRatio?: number;
}

export interface HealthSnapshot {
  reachable: boolean;
  latencyMs?: number;
  message?: string;
  details?: Readonly<Record<string, unknown>>;
  at: number;
}

export interface StatsSnapshot {
  metrics: Readonly<Record<string, number | string | boolean | null>>;
  at: number;
}

export type HealthResult = Result<HealthSnapshot, DomainError>;
export type StatsResult = Result<StatsSnapshot, DomainError>;

export abstract class BaseService {
  abstract readonly kind: string;
  abstract readonly instanceId: string;
  abstract readonly pollPolicy: PollPolicy;

  get id(): string {
    return `${this.kind}:${this.instanceId}`;
  }

  abstract checkHealth(signal: AbortSignal): Promise<HealthResult>;
  abstract getStats(signal: AbortSignal): Promise<StatsResult>;

  onStart?(): Promise<void>;
  onStop?(): Promise<void>;
}

export interface Controllable {
  control(action: string, signal: AbortSignal): Promise<Result<void, DomainError>>;
}

export function isControllable(svc: BaseService): svc is BaseService & Controllable {
  return typeof (svc as Partial<Controllable>).control === 'function';
}
