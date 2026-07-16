import {
  assertShadowResultIsolation,
  buildShadowDetectorIdempotencyKey,
  buildSkippedShadowResult,
  canExecuteShadowDetector,
  compareShadowCandidatesWithNativeEvents,
} from './shadow-detector.contract';

describe('shadow-detector.contract', () => {
  it('skips execution for UNSUPPORTED capability', () => {
    expect(canExecuteShadowDetector('UNSUPPORTED')).toBe(false);
    expect(canExecuteShadowDetector('SHADOW')).toBe(true);
  });

  it('builds deterministic idempotency keys', () => {
    const key = buildShadowDetectorIdempotencyKey('trip-1', 'cold_engine_load', 'v1');
    expect(key).toBe('shadow-detector:trip-1:cold_engine_load:v1');
  });

  it('compares native and shadow candidates within window', () => {
    const comparison = compareShadowCandidatesWithNativeEvents({
      candidateEvents: [
        { eventType: 'HARSH_BRAKING', occurredAt: '2026-07-16T10:00:01.000Z' },
        { eventType: 'HARSH_ACCELERATION', occurredAt: '2026-07-16T10:05:00.000Z' },
      ],
      nativeEvents: [
        { eventType: 'HARSH_BRAKING', occurredAt: new Date('2026-07-16T10:00:00.500Z') },
      ],
      windowSeconds: 2,
    });
    expect(comparison.matchedWithinWindow).toBe(1);
    expect(comparison.shadowOnlyCount).toBe(1);
    expect(comparison.nativeOnlyCount).toBe(0);
  });

  it('rejects shadow results that target production side effects', () => {
    const skipped = buildSkippedShadowResult({
      detectorId: 'cold_engine_load',
      modelVersion: 'v1',
      capabilityStatus: 'UNSUPPORTED',
      skipReason: 'capability_unsupported',
    });
    assertShadowResultIsolation(skipped);

    expect(() =>
      assertShadowResultIsolation({
        ...skipped,
        skipped: false,
        context: { writesDrivingEvent: true },
      }),
    ).toThrow(/DrivingEvent/);
  });
});
