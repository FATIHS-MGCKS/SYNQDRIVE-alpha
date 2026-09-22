import {
  classifyProviderGapFailureReason,
  isProviderGapFailureReason,
  mapProviderGapSemanticFailureReason,
  PROVIDER_GAP_FAILURE_REASONS,
} from './provider-observability-gap-failure-reason';
import { recordProviderGapLifecycleFailure } from './provider-observability-gap.metrics';

describe('provider observability gap failure reason taxonomy (B1.2Y1.2)', () => {
  it('TEST_METRIC_CARDINALITY_GUARD: dynamic error text is not a metric label', () => {
    const dynamicMessage =
      'Cannot read properties of undefined (reading "totallyUniqueField_xyz_12345")';
    const bounded = classifyProviderGapFailureReason(new Error(dynamicMessage));
    expect(isProviderGapFailureReason(bounded)).toBe(true);
    expect(PROVIDER_GAP_FAILURE_REASONS).toContain(bounded);
    expect(bounded).not.toContain('totallyUniqueField');
    expect(bounded).toBe('UNEXPECTED_ERROR');
  });

  it('maps semantic missing provenance to bounded reason', () => {
    expect(mapProviderGapSemanticFailureReason('missing_first_fresh_provider_timestamp')).toBe(
      'MISSING_PROVENANCE',
    );
  });

  it('recordProviderGapLifecycleFailure rejects non-taxonomy reason values', () => {
    const inc = jest.fn();
    const metrics = {
      batteryProviderObservabilityGapFailureTotal: { inc },
    } as never;

    recordProviderGapLifecycleFailure(metrics, 'entry', 'UNEXPECTED_ERROR');
    expect(inc).toHaveBeenCalledWith({ operation: 'entry', reason: 'UNEXPECTED_ERROR' });

    recordProviderGapLifecycleFailure(
      metrics,
      'resolution',
      'Cannot read properties of undefined (reading "outcome")',
    );
    expect(inc).toHaveBeenLastCalledWith({
      operation: 'resolution',
      reason: 'UNEXPECTED_ERROR',
    });
  });
});
