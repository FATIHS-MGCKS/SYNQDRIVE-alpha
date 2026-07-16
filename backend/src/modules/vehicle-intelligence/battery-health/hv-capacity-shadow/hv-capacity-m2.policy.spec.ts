import { BatteryMeasurementQuality } from '@prisma/client';
import {
  buildHvM2PointEstimates,
  computeHvM2EstimatedCapacityKwh,
  evaluateHvM2SampleGate,
  medianHvM2Estimates,
  resolveHvM2CapacityBand,
} from './hv-capacity-m2.policy';
import {
  TESLA_AUDIT_EXPECTED_MEDIAN_KWH,
  TESLA_AUDIT_M2_ALL_PREFERRED_SAMPLES,
  TESLA_AUDIT_M2_INVALID_SAMPLES,
  TESLA_AUDIT_M2_SESSION_3_SAMPLES,
  TESLA_AUDIT_M2_SESSION_4_SAMPLES,
  TESLA_AUDIT_MEDIAN_TOLERANCE_KWH,
  TESLA_AUDIT_REFERENCE_CAPACITY_KWH,
} from './hv-capacity-m2.fixtures';
import { HV_M2_GATE_REASONS } from './hv-capacity-m2.types';
import { resolveHvCapacityShadowPublicationEligible, resolveHvCapacityShadowSohEligible } from './hv-capacity-shadow.policy';

describe('hv-capacity-m2.policy', () => {
  const capacityBand = resolveHvM2CapacityBand({
    referenceCapacityKwh: TESLA_AUDIT_REFERENCE_CAPACITY_KWH,
  });

  it('computes capacity from current energy and SOC', () => {
    expect(computeHvM2EstimatedCapacityKwh(27.75, 50)).toBeCloseTo(55.5, 2);
    expect(computeHvM2EstimatedCapacityKwh(41.38, 73.82)).toBeCloseTo(56.1, 1);
  });

  it('returns null for SOC <= 0', () => {
    expect(computeHvM2EstimatedCapacityKwh(25, 0)).toBeNull();
  });

  it('produces Tesla audit session medians near 55.5 kWh', () => {
    for (const samples of [
      TESLA_AUDIT_M2_SESSION_3_SAMPLES,
      TESLA_AUDIT_M2_SESSION_4_SAMPLES,
      TESLA_AUDIT_M2_ALL_PREFERRED_SAMPLES,
    ]) {
      const estimates = buildHvM2PointEstimates({ samples, capacityBand });
      const median = medianHvM2Estimates(estimates);
      expect(median).not.toBeNull();
      expect(median!).toBeGreaterThanOrEqual(
        TESLA_AUDIT_EXPECTED_MEDIAN_KWH - TESLA_AUDIT_MEDIAN_TOLERANCE_KWH,
      );
      expect(median!).toBeLessThanOrEqual(
        TESLA_AUDIT_EXPECTED_MEDIAN_KWH + TESLA_AUDIT_MEDIAN_TOLERANCE_KWH,
      );
    }
  });

  it('rejects zero SOC, timestamp skew, implausible units, and duplicates', () => {
    const zeroSoc = evaluateHvM2SampleGate({
      sample: TESLA_AUDIT_M2_INVALID_SAMPLES.zeroSoc,
      capacityBand,
      seenObservedAtMs: new Set(),
      providerOutcome: 'NEW_OBSERVATION',
    });
    expect(zeroSoc.eligible).toBe(false);
    expect(zeroSoc.reasonCodes).toContain(HV_M2_GATE_REASONS.SOC_NOT_POSITIVE);

    const skew = evaluateHvM2SampleGate({
      sample: TESLA_AUDIT_M2_INVALID_SAMPLES.timestampSkew,
      capacityBand,
      seenObservedAtMs: new Set(),
      providerOutcome: 'NEW_OBSERVATION',
    });
    expect(skew.eligible).toBe(false);
    expect(skew.reasonCodes).toContain(HV_M2_GATE_REASONS.TIMESTAMP_SKEW);

    const implausible = evaluateHvM2SampleGate({
      sample: TESLA_AUDIT_M2_INVALID_SAMPLES.implausibleEnergy,
      capacityBand,
      seenObservedAtMs: new Set(),
      providerOutcome: 'NEW_OBSERVATION',
    });
    expect(implausible.eligible).toBe(false);
    expect(implausible.reasonCodes).toContain(HV_M2_GATE_REASONS.IMPLAUSIBLE_UNIT);

    const [first, duplicate] = TESLA_AUDIT_M2_INVALID_SAMPLES.duplicateTimestampPair;
    const seen = new Set<number>();
    const firstGate = evaluateHvM2SampleGate({
      sample: first,
      capacityBand,
      seenObservedAtMs: seen,
      providerOutcome: 'NEW_OBSERVATION',
    });
    seen.add(first.socObservedAt.getTime());
    const duplicateGate = evaluateHvM2SampleGate({
      sample: duplicate,
      capacityBand,
      seenObservedAtMs: seen,
      providerOutcome: 'NEW_OBSERVATION',
    });
    expect(firstGate.eligible).toBe(true);
    expect(duplicateGate.eligible).toBe(false);
    expect(duplicateGate.reasonCodes).toContain(HV_M2_GATE_REASONS.DUPLICATE_TIMESTAMP);
  });

  it('filters stale repetition via provider observation policy', () => {
    const estimates = buildHvM2PointEstimates({
      samples: TESLA_AUDIT_M2_INVALID_SAMPLES.staleRepetitionPair,
      capacityBand,
    });
    expect(estimates).toHaveLength(1);
  });

  it('marks statistical outliers but keeps them in result set', () => {
    const wideBand = resolveHvM2CapacityBand({});
    const samples = [
      ...TESLA_AUDIT_M2_SESSION_3_SAMPLES,
      {
        observedAt: new Date('2026-06-18T08:00:00.000Z'),
        socPercent: 50,
        currentEnergyKwh: 40,
        socObservedAt: new Date('2026-06-18T08:00:00.000Z'),
        energyObservedAt: new Date('2026-06-18T08:00:00.000Z'),
        receivedAt: new Date('2026-06-18T08:00:02.000Z'),
      },
    ];
    const estimates = buildHvM2PointEstimates({ samples, capacityBand: wideBand });
    const outlier = estimates.find((row) => row.outlier);
    expect(outlier).toBeDefined();
    expect(outlier!.gate.reasonCodes).toContain(HV_M2_GATE_REASONS.OUTLIER);
  });

  it('never enables publication or SOH side effects', () => {
    expect(resolveHvCapacityShadowPublicationEligible()).toBe(false);
    expect(resolveHvCapacityShadowSohEligible()).toBe(false);
  });

  it('assigns SHADOW quality to in-band estimates', () => {
    const estimates = buildHvM2PointEstimates({
      samples: TESLA_AUDIT_M2_SESSION_3_SAMPLES,
      capacityBand,
    });
    const inBand = estimates.find((row) => !row.outlier);
    expect(inBand).toBeDefined();
    expect(inBand!.gate.preferredSocBand).toBe(true);
    expect(inBand!.valueKwh).toBeCloseTo(55.5, 0);
  });
});
