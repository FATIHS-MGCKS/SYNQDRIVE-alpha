import { describe, expect, it } from 'vitest';
import { labelEnforcementStatus, labelLifecycleStatus } from './data-processing-status-labels';

const t = (key: string) => key;

describe('data-processing-status-labels', () => {
  it('maps lifecycle statuses to i18n keys', () => {
    expect(labelLifecycleStatus('ACTIVE', t)).toBe('dataProcessing.status.lifecycle.ACTIVE');
    expect(labelLifecycleStatus('REVOKED', t)).toBe('dataProcessing.status.lifecycle.REVOKED');
  });

  it('maps enforcement statuses to i18n keys', () => {
    expect(labelEnforcementStatus('ENFORCED', t)).toBe('dataProcessing.status.enforcement.ENFORCED');
    expect(labelEnforcementStatus('ENFORCEMENT_ERROR', t)).toBe(
      'dataProcessing.status.enforcement.ENFORCEMENT_ERROR',
    );
  });

  it('falls back to raw enum for unknown values', () => {
    expect(labelLifecycleStatus('CUSTOM', t)).toBe('CUSTOM');
  });
});
