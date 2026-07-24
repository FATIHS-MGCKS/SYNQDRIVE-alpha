import { describe, expect, it } from 'vitest';
import { parseLifecycleApiError } from './data-processing-lifecycle.errors';

describe('data-processing-lifecycle.errors', () => {
  it('detects HTTP 409 conflicts', () => {
    const parsed = parseLifecycleApiError(new Error('Request failed with status 409'));
    expect(parsed.isConflict).toBe(true);
    expect(parsed.status).toBe(409);
  });

  it('detects policy lifecycle conflict codes', () => {
    const parsed = parseLifecycleApiError(new Error('[POLICY_IMMUTABLE] Record cannot be modified'));
    expect(parsed.isConflict).toBe(true);
    expect(parsed.code).toBe('POLICY_IMMUTABLE');
    expect(parsed.message).toBe('Record cannot be modified');
  });

  it('detects activation blocked conflicts', () => {
    const parsed = parseLifecycleApiError(new Error('[ACTIVATION_BLOCKED] missing: DPIA, DPA'));
    expect(parsed.isConflict).toBe(true);
    expect(parsed.code).toBe('ACTIVATION_BLOCKED');
  });

  it('returns safe fallback for unknown errors', () => {
    const parsed = parseLifecycleApiError('not an error');
    expect(parsed.isConflict).toBe(false);
    expect(parsed.message).toBe('dataProcessing.lifecycle.errors.unknown');
  });
});
