import { describe, it, expect } from 'vitest';
import {
  NotFoundError,
  UnavailableError,
  UnauthorizedError,
  TimeoutError,
  CircuitOpenError,
  ValidationError,
  isDomainError,
} from './errors.js';

describe('DomainError hierarchy', () => {
  it('assigns correct code and http status for each subclass', () => {
    expect(new NotFoundError('x').code).toBe('NOT_FOUND');
    expect(new NotFoundError('x').httpStatus).toBe(404);
    expect(new UnavailableError('x').httpStatus).toBe(503);
    expect(new UnauthorizedError('x').httpStatus).toBe(401);
    expect(new TimeoutError('x').httpStatus).toBe(504);
    expect(new CircuitOpenError('x').httpStatus).toBe(503);
    expect(new ValidationError('x').httpStatus).toBe(400);
  });

  it('preserves message and context', () => {
    const e = new NotFoundError('missing', { id: 'foo' });
    expect(e.message).toBe('missing');
    expect(e.context).toEqual({ id: 'foo' });
    expect(e.name).toBe('NotFoundError');
  });

  it('isDomainError narrows', () => {
    expect(isDomainError(new NotFoundError('x'))).toBe(true);
    expect(isDomainError(new Error('x'))).toBe(false);
    expect(isDomainError('x')).toBe(false);
  });
});
