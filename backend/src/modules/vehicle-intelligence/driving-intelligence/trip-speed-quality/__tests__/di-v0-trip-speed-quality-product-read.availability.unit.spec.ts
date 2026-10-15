import { resolveGpsSpeedEvaluationAvailabilityWithoutProjection } from '../di-v0-trip-speed-quality-product-read.availability';

describe('resolveGpsSpeedEvaluationAvailabilityWithoutProjection', () => {
  it('maps in-flight S4 statuses to PENDING', () => {
    expect(resolveGpsSpeedEvaluationAvailabilityWithoutProjection('PENDING', null)).toBe('PENDING');
    expect(resolveGpsSpeedEvaluationAvailabilityWithoutProjection('LEASED', null)).toBe('PENDING');
    expect(resolveGpsSpeedEvaluationAvailabilityWithoutProjection('FAILED_RETRYABLE', null)).toBe(
      'PENDING',
    );
  });

  it('maps terminal S4 failures to UNAVAILABLE (not PENDING)', () => {
    expect(resolveGpsSpeedEvaluationAvailabilityWithoutProjection('FAILED_TERMINAL', null)).toBe(
      'UNAVAILABLE',
    );
    expect(resolveGpsSpeedEvaluationAvailabilityWithoutProjection('SKIPPED_INELIGIBLE', null)).toBe(
      'UNAVAILABLE',
    );
  });

  it('maps COMPLETED + active outbox to PENDING', () => {
    expect(resolveGpsSpeedEvaluationAvailabilityWithoutProjection('COMPLETED', 'PROCESSING')).toBe(
      'PENDING',
    );
    expect(resolveGpsSpeedEvaluationAvailabilityWithoutProjection('COMPLETED', 'FAILED_RETRYABLE')).toBe(
      'PENDING',
    );
  });

  it('maps COMPLETED + outbox SKIPPED_INELIGIBLE to UNAVAILABLE (technical, not NOT_ASSESSABLE)', () => {
    expect(
      resolveGpsSpeedEvaluationAvailabilityWithoutProjection('COMPLETED', 'SKIPPED_INELIGIBLE'),
    ).toBe('UNAVAILABLE');
  });

  it('maps COMPLETED + no outbox to UNAVAILABLE', () => {
    expect(resolveGpsSpeedEvaluationAvailabilityWithoutProjection('COMPLETED', null)).toBe(
      'UNAVAILABLE',
    );
  });
});
