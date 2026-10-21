import { BatteryMeasurementQuality } from '@prisma/client';
import {
  collectCapacitySamples,
  computeQualifiedCapacityMedianKwh,
  resolveVehicleQualityScore,
} from './hv-measurement-quality.aggregates';
import type { HvMeasurementQualitySessionResult } from './hv-measurement-quality.types';

function session(
  overrides: Partial<HvMeasurementQualitySessionResult>,
): HvMeasurementQualitySessionResult {
  return {
    sessionId: 's1',
    startAt: '2026-01-01T00:00:00.000Z',
    endAt: '2026-01-01T01:00:00.000Z',
    startSocPercent: 20,
    endSocPercent: 80,
    deltaSocPercent: 60,
    energyAddedKwh: 30,
    energyProvenance: null,
    coverageDurationSeconds: 3600,
    measurementQuality: BatteryMeasurementQuality.SHADOW,
    qualityStatus: 'PARTIAL',
    qualityReasonCodes: [],
    m3GateEligible: false,
    m3GateReasonCodes: ['SESSION_NOT_VALIDATION_ELIGIBLE'],
    m3EstimatedCapacityKwh: 99,
    qualityLevel: 'Q2',
    qualityScore: 40,
    exclusionReasons: [],
    contributesToQ4Cohort: false,
    ...overrides,
  };
}

describe('hv-measurement-quality.aggregates', () => {
  it('excludes non-M3 capacities from qualified median', () => {
    const sessions = [
      session({ sessionId: 'bad', m3GateEligible: false, m3EstimatedCapacityKwh: 99 }),
      session({ sessionId: 'good', m3GateEligible: true, m3EstimatedCapacityKwh: 55 }),
      session({ sessionId: 'good2', m3GateEligible: true, m3EstimatedCapacityKwh: 57 }),
    ];
    const samples = collectCapacitySamples(sessions);
    expect(samples.exploratoryCapacitiesKwh).toEqual([99]);
    expect(samples.qualifiedM3CapacitiesKwh).toEqual([55, 57]);
    expect(computeQualifiedCapacityMedianKwh(sessions)).toBe(56);
  });

  it('vehicle score ignores Q1 sessions in the average', () => {
    const sessions = [
      session({ qualityLevel: 'Q1', qualityScore: 5 }),
      session({ sessionId: 'q3', qualityLevel: 'Q3', qualityScore: 80, m3GateEligible: true }),
    ];
    expect(resolveVehicleQualityScore(sessions)).toBe(80);
  });
});
