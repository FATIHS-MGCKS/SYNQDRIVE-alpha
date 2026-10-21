import { BatteryMeasurementQuality } from '@prisma/client';
import {
  evaluateHvMeasurementQualitySession,
  resolveQ4CohortSessionIds,
  recommendedAdditionalMeasurements,
} from './hv-measurement-quality.policy';
import type { HvMeasurementQualitySessionInput } from './hv-measurement-quality.types';

/** Non-extrema provenance so existing session-quality assessor can reach QUALIFIED / M3-eligible. */
const M3_VALIDATION_NATIVE_PROVENANCE = 'TEMPORAL_BOUNDARY_V1';

function qualifiedPartialSession(
  overrides: Partial<HvMeasurementQualitySessionInput> = {},
): HvMeasurementQualitySessionInput {
  return {
    sessionId: 'sess-qualified',
    startAt: new Date('2026-10-16T13:15:02.931Z'),
    endAt: new Date('2026-10-16T19:52:53.932Z'),
    source: 'DIMO_RECHARGE_SEGMENT',
    isOngoing: false,
    startSocPercent: 66.4,
    endSocPercent: 100,
    startEnergyKwh: 37.5,
    endEnergyKwh: 55,
    energyAddedKwh: 18.66,
    deltaSocPercent: 33.6,
    measurementQuality: BatteryMeasurementQuality.SHADOW,
    metadata: {
      durationSeconds: 23_871,
      qualityStatus: 'PARTIAL',
      capacityValidationEligible: false,
      capacityShadowEligible: true,
      addedEnergyProvenance: 'SEGMENT_EXTREMA',
      socProvenance: 'SEGMENT_EXTREMA',
      qualityReasonCodes: ['soc_extrema_proxy', 'soc_delta_partial_m2'],
      isChargingObservedAny: true,
    },
    ...overrides,
  };
}

describe('hv-measurement-quality.policy', () => {
  it('never promotes to Q3 when M3 validation gate fails (fail-closed)', () => {
    const row = qualifiedPartialSession();
    const result = evaluateHvMeasurementQualitySession(row, new Set());
    expect(result.m3GateEligible).toBe(false);
    expect(result.qualityLevel).toBe('Q2');
    expect(result.qualityScore).toBeLessThanOrEqual(66);
    expect(result.exclusionReasons).toContain('SESSION_NOT_VALIDATION_ELIGIBLE');
  });

  it('assigns Q3 only when existing M3 gate passes', () => {
    const row = qualifiedPartialSession({
      sessionId: 'sess-m3-pass',
      startEnergyKwh: 30,
      endEnergyKwh: 46.5,
      energyAddedKwh: 16.5,
      metadata: {
        durationSeconds: 20_000,
        qualityStatus: 'QUALIFIED',
        capacityValidationEligible: true,
        capacityShadowEligible: true,
        addedEnergyProvenance: M3_VALIDATION_NATIVE_PROVENANCE,
        socProvenance: M3_VALIDATION_NATIVE_PROVENANCE,
        qualityReasonCodes: ['soc_delta_qualified'],
        isChargingObservedAny: true,
      },
    });
    const result = evaluateHvMeasurementQualitySession(row, new Set());
    expect(result.m3GateEligible).toBe(true);
    expect(result.qualityLevel).toBe('Q3');
    expect(result.qualityScore).toBeGreaterThan(66);
  });

  it('does not let large delta SOC alone exceed Q2 score when gate fails', () => {
    const row = qualifiedPartialSession({ deltaSocPercent: 40 });
    const result = evaluateHvMeasurementQualitySession(row, new Set());
    expect(result.m3GateEligible).toBe(false);
    expect(result.qualityScore).toBeLessThanOrEqual(66);
  });

  it('assigns Q4 only for consistent multi-session M3-pass cohort', () => {
    const mk = (id: string, kwh: number) =>
      evaluateHvMeasurementQualitySession(
        qualifiedPartialSession({
          sessionId: id,
          energyAddedKwh: (kwh * 30) / 100,
          deltaSocPercent: 30,
          metadata: {
            durationSeconds: 18_000,
            qualityStatus: 'QUALIFIED',
            capacityValidationEligible: true,
            capacityShadowEligible: true,
            addedEnergyProvenance: M3_VALIDATION_NATIVE_PROVENANCE,
            socProvenance: M3_VALIDATION_NATIVE_PROVENANCE,
            qualityReasonCodes: ['soc_delta_qualified'],
            isChargingObservedAny: true,
          },
          startEnergyKwh: 30,
          endEnergyKwh: 46.5,
        }),
        new Set(),
      );

    const a = mk('a', 55);
    const b = mk('b', 55.1);
    const c = mk('c', 55.2);
    const cohort = resolveQ4CohortSessionIds([a, b, c]);
    expect(cohort.size).toBe(3);
    const withQ4 = evaluateHvMeasurementQualitySession(
      qualifiedPartialSession({
        sessionId: 'a',
        energyAddedKwh: 16.5,
        deltaSocPercent: 30,
        metadata: {
          durationSeconds: 18_000,
          qualityStatus: 'QUALIFIED',
          capacityValidationEligible: true,
          capacityShadowEligible: true,
          addedEnergyProvenance: M3_VALIDATION_NATIVE_PROVENANCE,
          socProvenance: M3_VALIDATION_NATIVE_PROVENANCE,
          qualityReasonCodes: ['soc_delta_qualified'],
          isChargingObservedAny: true,
        },
        startEnergyKwh: 30,
        endEnergyKwh: 46.5,
      }),
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
