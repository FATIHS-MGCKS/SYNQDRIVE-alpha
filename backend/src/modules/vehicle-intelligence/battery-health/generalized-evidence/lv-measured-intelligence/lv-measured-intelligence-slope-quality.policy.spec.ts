import { assessLvMeasuredC3SlopeQualityV1 } from './lv-measured-intelligence-slope-quality.policy';

describe('assessLvMeasuredC3SlopeQualityV1', () => {
  it('flags Ruptela production -14170.9 mV/h session (short span, charging end, duplicate rung)', () => {
    const quality = assessLvMeasuredC3SlopeQualityV1({
      robustRestSlopeMvPerHour: -14170.90909090909,
      numberOfValidRestPoints: 2,
      observationSpanMs: 110_000,
      sessionEndReason: 'CHARGING_DETECTED',
      retentionPoints: [
        {
          voltageMv: 12635,
          actualRestAgeMs: 9000,
          nominalRestIntervalIndex: 0,
          evidenceClass: 'PARKED_REST_CANDIDATE',
          observationId: 'a',
          sourceMeasurementId: 'm1',
          stateAlignmentClass: 'ALIGNED',
          evidenceConfidence: 'MEDIUM',
          providerObservationAt: '2026-10-13T18:14:01.000Z',
        },
        {
          voltageMv: 12202,
          actualRestAgeMs: 119_000,
          nominalRestIntervalIndex: 0,
          evidenceClass: 'PARKED_REST_CANDIDATE',
          observationId: 'b',
          sourceMeasurementId: 'm2',
          stateAlignmentClass: 'ALIGNED',
          evidenceConfidence: 'MEDIUM',
          providerObservationAt: '2026-10-13T18:15:51.000Z',
        },
      ],
    });

    expect(quality.interpretability).toBe('CONTEXT_LIMITED');
    expect(quality.limitationCodes).toEqual(
      expect.arrayContaining([
        'C3_SLOPE_TWO_POINT_MINIMUM_ONLY',
        'C3_SLOPE_SHORT_OBSERVATION_SPAN',
        'C3_SLOPE_CHARGING_TRANSITION_END',
        'C3_SLOPE_DUPLICATE_NOMINAL_RUNG',
      ]),
    );
  });

  it('flags Ruptela production -23720.5 mV/h session (short span, charging end)', () => {
    const quality = assessLvMeasuredC3SlopeQualityV1({
      robustRestSlopeMvPerHour: -23720.54794520548,
      numberOfValidRestPoints: 2,
      observationSpanMs: 73_000,
      sessionEndReason: 'CHARGING_DETECTED',
      retentionPoints: [
        {
          voltageMv: 12574,
          actualRestAgeMs: 22_281_000,
          nominalRestIntervalIndex: 1,
          evidenceClass: 'PARKED_REST_CANDIDATE',
          observationId: 'a',
          sourceMeasurementId: 'm1',
          stateAlignmentClass: 'ALIGNED',
          evidenceConfidence: 'MEDIUM',
          providerObservationAt: '2026-09-29T05:35:18.000Z',
        },
        {
          voltageMv: 12093,
          actualRestAgeMs: 22_354_000,
          nominalRestIntervalIndex: 1,
          evidenceClass: 'PARKED_REST_CANDIDATE',
          observationId: 'b',
          sourceMeasurementId: 'm2',
          stateAlignmentClass: 'ALIGNED',
          evidenceConfidence: 'MEDIUM',
          providerObservationAt: '2026-09-29T05:36:31.000Z',
        },
      ],
    });

    expect(quality.interpretability).toBe('CONTEXT_LIMITED');
    expect(quality.limitationCodes).toContain('C3_SLOPE_SHORT_OBSERVATION_SPAN');
    expect(quality.limitationCodes).toContain('C3_SLOPE_DUPLICATE_NOMINAL_RUNG');
  });

  it('allows multi-hour span with distinct nominal rungs and non-charging end', () => {
    const quality = assessLvMeasuredC3SlopeQualityV1({
      robustRestSlopeMvPerHour: -120,
      numberOfValidRestPoints: 3,
      observationSpanMs: 3 * 60 * 60 * 1000,
      sessionEndReason: 'TRIP_STARTED',
      retentionPoints: [
        {
          voltageMv: 14000,
          actualRestAgeMs: 3_600_000,
          nominalRestIntervalIndex: 1,
          evidenceClass: 'PARKED_REST_CANDIDATE',
          observationId: 'a',
          sourceMeasurementId: 'm1',
          stateAlignmentClass: 'ALIGNED',
          evidenceConfidence: 'MEDIUM',
          providerObservationAt: null,
        },
        {
          voltageMv: 13900,
          actualRestAgeMs: 7_200_000,
          nominalRestIntervalIndex: 2,
          evidenceClass: 'PARKED_REST_CANDIDATE',
          observationId: 'b',
          sourceMeasurementId: 'm2',
          stateAlignmentClass: 'ALIGNED',
          evidenceConfidence: 'MEDIUM',
          providerObservationAt: null,
        },
        {
          voltageMv: 13800,
          actualRestAgeMs: 10_800_000,
          nominalRestIntervalIndex: 3,
          evidenceClass: 'PARKED_REST_CANDIDATE',
          observationId: 'c',
          sourceMeasurementId: 'm3',
          stateAlignmentClass: 'ALIGNED',
          evidenceConfidence: 'MEDIUM',
          providerObservationAt: null,
        },
      ],
    });

    expect(quality.interpretability).toBe('REST_SELF_DISCHARGE_TREND');
    expect(quality.limitationCodes).toEqual([]);
  });
});
