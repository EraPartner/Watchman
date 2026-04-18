export type DomainErrorCode =
  | 'NOT_FOUND'
  | 'UNAVAILABLE'
  | 'UNAUTHORIZED'
  | 'TIMEOUT'
  | 'CIRCUIT_OPEN'
  | 'VALIDATION';

export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;
  abstract readonly httpStatus: number;

  constructor(
    message: string,
    readonly context?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND' as const;
  readonly httpStatus = 404;
}

export class UnavailableError extends DomainError {
  readonly code = 'UNAVAILABLE' as const;
  readonly httpStatus = 503;
}

export class UnauthorizedError extends DomainError {
  readonly code = 'UNAUTHORIZED' as const;
  readonly httpStatus = 401;
}

export class TimeoutError extends DomainError {
  readonly code = 'TIMEOUT' as const;
  readonly httpStatus = 504;
}

export class CircuitOpenError extends DomainError {
  readonly code = 'CIRCUIT_OPEN' as const;
  readonly httpStatus = 503;
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION' as const;
  readonly httpStatus = 400;
}

export function isDomainError(err: unknown): err is DomainError {
  return err instanceof DomainError;
}
