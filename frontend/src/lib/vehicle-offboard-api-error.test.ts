import { describe, expect, it } from 'vitest';
import { classifyOffboardHttpFailure } from './vehicle-offboard-api-error';

describe('classifyOffboardHttpFailure (VO5C-P2A.2)', () => {
  it('maps status=0 to TRANSPORT_UNCERTAIN', () => {
    const err = classifyOffboardHttpFailure(0, undefined, 'Network error');
    expect(err.kind).toBe('TRANSPORT_UNCERTAIN');
    expect(err.status).toBe(0);
  });

  it('maps HTTP 403 STEP_UP_REQUIRED', () => {
    const err = classifyOffboardHttpFailure(403, 'STEP_UP_REQUIRED', 'step up');
    expect(err.kind).toBe('STEP_UP_REQUIRED');
  });

  it('maps HTTP 422 operational blocker', () => {
    const err = classifyOffboardHttpFailure(422, 'OFFBOARD_OPERATIONALLY_BLOCKED', 'blocked', {
      blockingReasons: ['ACTIVE_RENTAL'],
    });
    expect(err.kind).toBe('OPERATIONALLY_BLOCKED');
  });

  it('maps HTTP 409 semantic conflict by code', () => {
    const err = classifyOffboardHttpFailure(409, 'VEHICLE_REGISTRY_INVALID_TRANSITION', 'conflict');
    expect(err.kind).toBe('SEMANTIC_CONFLICT');
  });

  it('maps HTTP 404 to HTTP_REJECTION (fail closed)', () => {
    const err = classifyOffboardHttpFailure(404, 'NOT_FOUND', 'route missing');
    expect(err.kind).toBe('HTTP_REJECTION');
    expect(err.status).toBe(404);
  });

  it('maps HTTP 500 to HTTP_REJECTION (not transport uncertain)', () => {
    const err = classifyOffboardHttpFailure(500, 'INTERNAL_ERROR', 'server failed');
    expect(err.kind).toBe('HTTP_REJECTION');
    expect(err.kind).not.toBe('TRANSPORT_UNCERTAIN');
  });

  it('does not treat HTTP 400 failed message as transport uncertain', () => {
    const err = classifyOffboardHttpFailure(400, 'BAD_REQUEST', 'Request failed validation');
    expect(err.kind).toBe('HTTP_REJECTION');
  });
});
