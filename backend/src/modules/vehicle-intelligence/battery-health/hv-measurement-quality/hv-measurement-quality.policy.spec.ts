import { BatteryMeasurementQuality } from '@prisma/client';
import {
  evaluateHvMeasurementQualitySession,
  resolveQ4CohortSessionIds,
  recommendedAdditionalMeasurements,
} from './hv-measurement-quality.policy';
import { qualifiedPartialSession } from './hv-measurement-quality.policy.spec-helpers';

describe('hv-measurement-quality.policy', () => {
  it('uses currentEnergyProvenance (not addedEnergyProvenance) for energy extrema proxy', () => {
    const row = qualifiedPartialSession({
      metadata: {
        durationSeconds: 23_871,
        qualityStatus: 'QUALIFIED',
        socProvenance: 'SNAPSHOT_TEMPORAL_BOUNDARY_V1',
        currentEnergyProvenance: 'SNAPSHOT_TEMPORAL_BOUNDARY_V1',
        addedEnergyProvenance: 'SEGMENT_EXTREMA',
        segmentAddedEnergyMinKwh: 0,
        isChargingObservedAny: true,
      },
    });
    const assessment = evaluateHvMeasurementQualitySession(row, new Set());
    expect(assessment.m3GateEligible).toBe(true);
  });

  it('never promotes to Q3 when M3 validation gate fails (fail-closed)', () => {
    const row = qualifiedPartialSession({
      metadata: {
        durationSeconds: 23_871,
        qualityStatus: 'PARTIAL',
        addedEnergyProvenance: 'SEGMENT_EXTREMA',
        socProvenance: 'SEGMENT_EXTREMA',
        qualityReasonCodes: ['soc_extrema_proxy', 'soc_delta_partial_m2'],
        isChargingObservedAny: true,
      },
    });
    const result = evaluateHvMeasurementQualitySession(row, new Set());
    expect(result.m3GateEligible).toBe(false);
    expect(result.qualityLevel).toBe('Q2');
    expect(result.qualityScore).toBeLessThanOrEqual(66);
    expect(result.exclusionReasons).toContain('SESSION_NOT_VALIDATION_ELIGIBLE');
  });

  it('assigns Q3 only when existing M3 gate passes', () => {
    const row = qualifiedPartialSession({ sessionId: 'sess-m3-pass' });
    const result = evaluateHvMeasurementQualitySession(row, new Set());
    expect(result.m3GateEligible).toBe(true);
    expect(result.qualityLevel).toBe('Q3');
    expect(result.qualityScore).toBeGreaterThan(66);
  });

  it('does not let large delta SOC alone exceed Q2 score when gate fails', () => {
    const row = qualifiedPartialSession({
      deltaSocPercent: 40,
      metadata: {
        durationSeconds: 23_871,
        qualityStatus: 'PARTIAL',
        addedEnergyProvenance: 'SEGMENT_EXTREMA',
        socProvenance: 'SEGMENT_EXTREMA',
        isChargingObservedAny: true,
      },
    });
    const result = evaluateHvMeasurementQualitySession(row, new Set());
    expect(result.m3GateEligible).toBe(false);
    expect(result.qualityScore).toBeLessThanOrEqual(66);
  });

  it('assigns Q4 only with persisted cross-session gate and session membership', () => {
    const mk = (id: string) =>
      evaluateHvMeasurementQualitySession(
        qualifiedPartialSession({ sessionId: id }),
        new Set(),
      );

    const a = mk('a');
    const b = mk('b');
    const c = mk('c');
    const cohort = resolveQ4CohortSessionIds([a, b, c], {
      shadowGatePassed: true,
      sessionIds: ['a', 'b', 'c'],
    });
    expect(cohort.size).toBe(3);
    const withQ4 = evaluateHvMeasurementQualitySession(
      qualifiedPartialSession({ sessionId: 'a' }),
      cohort,
    );
    expect(withQ4.qualityLevel).toBe('Q4');
  });

  it('recommends additional measurements until SOH gate minimum', () => {
    expect(recommendedAdditionalMeasurements(0)).toBe(3);
    expect(recommendedAdditionalMeasurements(2)).toBe(1);
    expect(recommendedAdditionalMeasurements(4)).toBe(0);
  });

  it('classifies contaminated sessions as Q1', () => {
    const row = qualifiedPartialSession({
      measurementQuality: BatteryMeasurementQuality.CONTAMINATED_BY_CHARGING,
      metadata: { qualityStatus: 'ADDED_ENERGY_RESET' },
    });
    const result = evaluateHvMeasurementQualitySession(row, new Set());
    expect(result.qualityLevel).toBe('Q1');
    expect(result.qualityScore).toBeLessThanOrEqual(25);
  });
});
