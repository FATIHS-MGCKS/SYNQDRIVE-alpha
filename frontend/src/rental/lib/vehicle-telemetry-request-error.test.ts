import { describe, expect, it, vi } from 'vitest';
import { ApiHttpError } from '../../lib/api';
import {
  classifyTelemetryRequestError,
  combineAbortSignals,
} from './vehicle-telemetry-request-error';

describe('classifyTelemetryRequestError', () => {
  it('does not retry auth errors', () => {
    const policy = classifyTelemetryRequestError(new ApiHttpError('Unauthorized', 401), 1);
    expect(policy.kind).toBe('auth');
    expect(policy.retryable).toBe(false);
    expect(policy.userMessage).toMatch(/Sitzung/);
  });

  it('does not retry permission or data authorization', () => {
    const permission = classifyTelemetryRequestError(
      new ApiHttpError('Missing permission: fleet.read', 403),
      1,
    );
    expect(permission.kind).toBe('permission');
    expect(permission.retryable).toBe(false);

    const dataAuth = classifyTelemetryRequestError(
      new ApiHttpError('[DATA_AUTHORIZATION_DENIED] denied', 403),
      1,
    );
    expect(dataAuth.kind).toBe('data_authorization');
    expect(dataAuth.retryable).toBe(false);
  });

  it('does not retry 404', () => {
    const policy = classifyTelemetryRequestError(new ApiHttpError('Not found', 404), 1);
    expect(policy.kind).toBe('not_found');
    expect(policy.retryable).toBe(false);
  });

  it('retries 429 with Retry-After', () => {
    const policy = classifyTelemetryRequestError(
      new ApiHttpError('Too many', 429, 8_000),
      1,
    );
    expect(policy.kind).toBe('rate_limit');
    expect(policy.retryable).toBe(true);
    expect(policy.backoffMs).toBe(8_000);
  });

  it('retries 500 with backoff', () => {
    const policy = classifyTelemetryRequestError(new ApiHttpError('Server error', 500), 2);
    expect(policy.kind).toBe('server');
    expect(policy.retryable).toBe(true);
    expect(policy.backoffMs).toBeGreaterThan(0);
  });

  it('retries offline and network failures', () => {
    const policy = classifyTelemetryRequestError(new TypeError('Failed to fetch'), 1);
    expect(policy.kind).toBe('offline');
    expect(policy.retryable).toBe(true);
  });

  it('classifies session expired without ApiHttpError', () => {
    const policy = classifyTelemetryRequestError(new Error('Session expired'), 1);
    expect(policy.kind).toBe('auth');
    expect(policy.retryable).toBe(false);
  });

  it('classifies data authorization from plain error message', () => {
    const policy = classifyTelemetryRequestError(
      new Error('[DATA_AUTHORIZATION_DENIED] denied'),
      1,
    );
    expect(policy.kind).toBe('data_authorization');
    expect(policy.retryable).toBe(false);
  });
});

describe('combineAbortSignals', () => {
  it('aborts child when parent aborts', () => {
    const parent = new AbortController();
    const { signal, cleanup } = combineAbortSignals(parent.signal, 60_000);
    parent.abort();
    expect(signal.aborted).toBe(true);
    cleanup();
  });

  it('reports timeout separately from parent abort', async () => {
    vi.useFakeTimers();
    const parent = new AbortController();
    const { signal, cleanup, wasTimeout } = combineAbortSignals(parent.signal, 1_000);

    vi.advanceTimersByTime(1_000);
    expect(signal.aborted).toBe(true);
    expect(wasTimeout()).toBe(true);

    cleanup();
    vi.useRealTimers();
  });
});
