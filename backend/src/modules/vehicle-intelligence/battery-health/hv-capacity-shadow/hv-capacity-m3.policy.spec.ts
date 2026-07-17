import { BatteryMeasurementQuality } from '@prisma/client';
import {
  buildHvM3Estimate,
  computeHvM3EstimatedCapacityKwh,
  detectHvM3MethodConflict,
  evaluateHvM3SessionGate,
  resolveHvM3ObservationQuality,
} from './hv-capacity-m3.policy';
import {
  TESLA_AUDIT_M2_MEDIAN_FOR_CONFLICT_KWH,
  TESLA_AUDIT_M3_CAPACITY_TOLERANCE_KWH,
  TESLA_AUDIT_M3_IMPLAUSIBLE_SEGMENT_INPUT,
  TESLA_AUDIT_M3_IMPLAUSIBLE_TIMESERIES_CAPACITY_KWH,
  TESLA_AUDIT_M3_SESSION_4_EXPECTED_CAPACITY_KWH,
  TESLA_AUDIT_M3_SESSION_4_INPUT,
  TESLA_AUDIT_M3_SESSION_7_EXPECTED_CAPACITY_KWH,
  TESLA_AUDIT_M3_SESSION_7_IMPLAUSIBLE_FIRST_LAST_INPUT,
  TESLA_AUDIT_M3_SESSION_7_SEGMENT_INPUT,
} from './hv-capacity-m3.fixtures';
import { HV_M3_GATE_REASONS } from './hv-capacity-m3.types';

describe('hv-capacity-m3.policy', () => {
  it('computes capacity from segment added energy and delta SOC', () => {
    expect(computeHvM3EstimatedCapacityKwh(15.18, 27.4)).toBeCloseTo(55.4, 1);
    expect(computeHvM3EstimatedCapacityKwh(22.7, 40.3)).toBeCloseTo(56.3, 1);
  });

  it('returns null for non-positive inputs', () => {
    expect(computeHvM3EstimatedCapacityKwh(0, 30)).toBeNull();
    expect(computeHvM3EstimatedCapacityKwh(10, 0)).toBeNull();
  });

  it('accepts plausible Tesla audit session 4 (~55 kWh)', () => {
    const gate = evaluateHvM3SessionGate(TESLA_AUDIT_M3_SESSION_4_INPUT);
    expect(gate.eligible).toBe(true);
    expect(gate.reasonCodes).toHaveLength(0);

    const estimate = buildHvM3Estimate({
      session: TESLA_AUDIT_M3_SESSION_4_INPUT,
      m2MedianCapacityKwh: TESLA_AUDIT_M2_MEDIAN_FOR_CONFLICT_KWH,
    });

    expect(estimate).not.toBeNull();
    expect(estimate!.estimatedCapacityKwh).toBeGreaterThanOrEqual(
      TESLA_AUDIT_M3_SESSION_4_EXPECTED_CAPACITY_KWH -
        TESLA_AUDIT_M3_CAPACITY_TOLERANCE_KWH,
    );
    expect(estimate!.estimatedCapacityKwh).toBeLessThanOrEqual(
      TESLA_AUDIT_M3_SESSION_4_EXPECTED_CAPACITY_KWH +
        TESLA_AUDIT_M3_CAPACITY_TOLERANCE_KWH,
    );
    expect(estimate!.methodConflict).toBe(false);
    expect(resolveHvM3ObservationQuality(estimate!)).toBe(
      BatteryMeasurementQuality.VALID_PROXY,
    );
  });

  it('accepts plausible Tesla audit session 7 segment aggregate (~56 kWh)', () => {
    const estimate = buildHvM3Estimate({
      session: TESLA_AUDIT_M3_SESSION_7_SEGMENT_INPUT,
      m2MedianCapacityKwh: TESLA_AUDIT_M2_MEDIAN_FOR_CONFLICT_KWH,
    });

    expect(estimate).not.toBeNull();
    expect(estimate!.estimatedCapacityKwh).toBeCloseTo(
      TESLA_AUDIT_M3_SESSION_7_EXPECTED_CAPACITY_KWH,
      0,
    );
    expect(estimate!.methodConflict).toBe(false);
  });

  it('rejects implausible 71 kWh timeseries first/last divergence', () => {
    const gate = evaluateHvM3SessionGate(
      TESLA_AUDIT_M3_SESSION_7_IMPLAUSIBLE_FIRST_LAST_INPUT,
    );

    expect(gate.eligible).toBe(false);
    expect(gate.reasonCodes).toContain(HV_M3_GATE_REASONS.FIRST_LAST_DIVERGENCE);

    const naiveCapacity = computeHvM3EstimatedCapacityKwh(
      TESLA_AUDIT_M3_SESSION_7_IMPLAUSIBLE_FIRST_LAST_INPUT.endEnergyKwh! -
        TESLA_AUDIT_M3_SESSION_7_IMPLAUSIBLE_FIRST_LAST_INPUT.startEnergyKwh!,
      TESLA_AUDIT_M3_SESSION_7_IMPLAUSIBLE_FIRST_LAST_INPUT.deltaSocPercent!,
    );
    expect(naiveCapacity).toBeCloseTo(
      TESLA_AUDIT_M3_IMPLAUSIBLE_TIMESERIES_CAPACITY_KWH,
      0,
    );

    expect(
      buildHvM3Estimate({
        session: TESLA_AUDIT_M3_SESSION_7_IMPLAUSIBLE_FIRST_LAST_INPUT,
      }),
    ).toBeNull();
  });

  it('flags method conflict when segment aggregate implies ~71 kWh vs M2 median', () => {
    const estimate = buildHvM3Estimate({
      session: TESLA_AUDIT_M3_IMPLAUSIBLE_SEGMENT_INPUT,
      m2MedianCapacityKwh: TESLA_AUDIT_M2_MEDIAN_FOR_CONFLICT_KWH,
    });

    expect(estimate).not.toBeNull();
    expect(estimate!.estimatedCapacityKwh).toBeCloseTo(
      TESLA_AUDIT_M3_IMPLAUSIBLE_TIMESERIES_CAPACITY_KWH,
      0,
    );
    expect(estimate!.methodConflict).toBe(true);
    expect(estimate!.gate.reasonCodes).toContain(
      HV_M3_GATE_REASONS.METHOD_CONFLICT_WITH_M2,
    );
    expect(resolveHvM3ObservationQuality(estimate!)).toBe(
      BatteryMeasurementQuality.INSUFFICIENT_COVERAGE,
    );

    const conflict = detectHvM3MethodConflict({
      m3CapacityKwh: estimate!.estimatedCapacityKwh,
      m2MedianCapacityKwh: TESLA_AUDIT_M2_MEDIAN_FOR_CONFLICT_KWH,
    });
    expect(conflict.conflict).toBe(true);
    expect(conflict.deviationRatio).toBeGreaterThan(0.1);
  });

  it('rejects sessions below M3 delta SOC threshold', () => {
    const gate = evaluateHvM3SessionGate({
      ...TESLA_AUDIT_M3_SESSION_4_INPUT,
      deltaSocPercent: 15,
      capacityValidationEligible: false,
    });

    expect(gate.eligible).toBe(false);
    expect(gate.reasonCodes).toContain(
      HV_M3_GATE_REASONS.SESSION_NOT_VALIDATION_ELIGIBLE,
    );
    expect(gate.reasonCodes).toContain(HV_M3_GATE_REASONS.INSUFFICIENT_SOC_DELTA);
  });
});
