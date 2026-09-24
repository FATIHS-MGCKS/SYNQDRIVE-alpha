import {
  applyR1ContextTemporalContainment,
  containContextAssessmentForSourceFamily,
  isTemporallyContainedContextAssessment,
} from './event-context-r1-temporal-containment';

function signal(overrides: Record<string, unknown> = {}) {
  return {
    signal: 'speed',
    count: 60,
    nonNullCount: 30,
    min: 10,
    max: 60,
    avg: 35,
    nearestValueToAnchor: 42,
    nearestSampleDistanceMs: 0,
    valueBeforeAnchor: 44,
    valueAfterAnchor: 40,
    coverageQuality: 'GOOD',
    ...overrides,
  };
}

function assessment() {
  return {
    version: 3,
    status: 'SUCCESS',
    anchorTimestamp: '2026-09-01T10:00:00.000Z',
    windowStart: '2026-09-01T09:59:30.000Z',
    windowEnd: '2026-09-01T10:00:30.000Z',
    confidence: 'HIGH',
    evidenceGrade: 'A',
    classifications: ['KICKDOWN_LIKELY'],
    preliminaryClassifications: ['KICKDOWN_LIKELY'],
    dataQuality: { sampleCount: 60, medianIntervalMs: 1000, nearestSampleToAnchorMs: 0, coverage: [] },
    contextQuality: { providerDelayMs: 0, contextConfidence: 'HIGH', sampleCount: 60 },
    speedContext: signal(),
    rpmContext: signal({ signal: 'rpm', max: 5200 }),
    throttleContext: signal({ signal: 'throttle' }),
    engineLoadContext: signal({ signal: 'engineLoad' }),
    coolantContext: signal({ signal: 'coolant', nearestValueToAnchor: 38 }),
  };
}

describe('Event context R1 temporal containment (EXP-021 C0.3)', () => {
  it('removes anchor-relative point-in-time claims and marks the assessment', () => {
    const input = assessment();
    const out = applyR1ContextTemporalContainment(input) as any;

    for (const key of ['speedContext', 'rpmContext', 'throttleContext', 'engineLoadContext', 'coolantContext']) {
      expect(out[key]).toMatchObject({
        nearestValueToAnchor: null,
        nearestSampleDistanceMs: null,
        valueBeforeAnchor: null,
        valueAfterAnchor: null,
      });
    }
    expect(out.dataQuality.nearestSampleToAnchorMs).toBeNull();
    expect(out.contextQuality.providerDelayMs).toBeNull();
    expect(out.contextQuality.contextConfidence).toBe('LOW');
    expect(out.confidence).toBe('LOW');
    expect(out.temporalContainment).toEqual({
      version: 'r1-temporal-containment-v1',
      reason: 'R1_HISTORICAL_OBD_RECORD_TIME_UNCERTAIN',
    });
    expect(isTemporallyContainedContextAssessment(out)).toBe(true);
  });

  it('keeps window aggregates, status, classifications and evidence grade', () => {
    const out = applyR1ContextTemporalContainment(assessment()) as any;
    expect(out.status).toBe('SUCCESS');
    expect(out.evidenceGrade).toBe('A');
    expect(out.classifications).toEqual(['KICKDOWN_LIKELY']);
    expect(out.rpmContext.max).toBe(5200);
    expect(out.speedContext).toMatchObject({ min: 10, max: 60, avg: 35, coverageQuality: 'GOOD' });
  });

  it('never mutates its input and is idempotent', () => {
    const input = assessment();
    const snapshot = JSON.parse(JSON.stringify(input));
    const once = applyR1ContextTemporalContainment(input);
    expect(input).toEqual(snapshot);
    expect(applyR1ContextTemporalContainment(once)).toBe(once);
  });

  it('keeps INSUFFICIENT confidence and tolerates legacy/non-object payloads', () => {
    const out = applyR1ContextTemporalContainment({ ...assessment(), confidence: 'INSUFFICIENT' }) as any;
    expect(out.confidence).toBe('INSUFFICIENT');
    expect(applyR1ContextTemporalContainment(null)).toBeNull();
    expect(applyR1ContextTemporalContainment('x')).toBe('x');
    const legacy = applyR1ContextTemporalContainment({ status: 'COMPLETED', anchorTimestamp: 't' }) as any;
    expect(legacy.temporalContainment).toBeDefined();
  });

  it.each(['API_SYNTHETIC', 'UNKNOWN'] as const)('does not touch %s assessments', (family) => {
    const input = assessment();
    expect(containContextAssessmentForSourceFamily(input, family)).toBe(input);
  });
});
