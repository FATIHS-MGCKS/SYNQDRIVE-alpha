import { BatteryMeasurementQuality } from '@prisma/client';
import {
  evaluateBatteryProviderObservation,
  type BatteryProviderObservationOutcome,
} from '../battery-provider-observation.policy';
import {
  HV_M2_DEFAULT_CAPACITY_MAX_KWH,
  HV_M2_DEFAULT_CAPACITY_MIN_KWH,
  HV_M2_GATE_REASONS,
  HV_M2_MAX_ENERGY_KWH,
  HV_M2_MAX_SOC_PERCENT,
  HV_M2_MAX_TIMESTAMP_DELTA_MS,
  HV_M2_MIN_ENERGY_KWH,
  HV_M2_MIN_SOC_PERCENT,
  HV_M2_OUTLIER_DEVIATION_RATIO,
  HV_M2_PROVIDER_SOURCE,
  HV_M2_REFERENCE_BAND_TOLERANCE,
  HV_M2_SOC_PREFERRED_MAX,
  HV_M2_SOC_PREFERRED_MIN,
  type HvCapacityM2CapacityBand,
  type HvCapacityM2GateEvaluation,
  type HvCapacityM2PointEstimate,
  type HvCapacityM2Sample,
  type HvM2GateReasonCode,
} from './hv-capacity-m2.types';

const BLOCKING_PROVIDER_OUTCOMES = new Set<BatteryProviderObservationOutcome>([
  'DUPLICATE_OBSERVATION',
  'STALE_REPLAY',
  'INVALID_TIMESTAMP',
  'OUT_OF_ORDER',
  'VALUE_CHANGED_WITHOUT_NEW_TIMESTAMP',
]);

export function computeHvM2EstimatedCapacityKwh(
  currentEnergyKwh: number,
  socPercent: number,
): number | null {
  if (!Number.isFinite(currentEnergyKwh) || !Number.isFinite(socPercent)) return null;
  if (socPercent <= HV_M2_MIN_SOC_PERCENT) return null;
  if (currentEnergyKwh <= 0) return null;
  return currentEnergyKwh / (socPercent / 100);
}

export function resolveHvM2CapacityBand(input: {
  referenceCapacityKwh?: number | null;
}): HvCapacityM2CapacityBand {
  const reference = input.referenceCapacityKwh ?? null;
  if (reference != null && Number.isFinite(reference) && reference > 0) {
    return {
      referenceCapacityKwh: reference,
      minKwh: reference * (1 - HV_M2_REFERENCE_BAND_TOLERANCE),
      maxKwh: reference * (1 + HV_M2_REFERENCE_BAND_TOLERANCE),
    };
  }

  return {
    referenceCapacityKwh: null,
    minKwh: HV_M2_DEFAULT_CAPACITY_MIN_KWH,
    maxKwh: HV_M2_DEFAULT_CAPACITY_MAX_KWH,
  };
}

export function isPreferredHvM2SocBand(socPercent: number): boolean {
  return socPercent >= HV_M2_SOC_PREFERRED_MIN && socPercent <= HV_M2_SOC_PREFERRED_MAX;
}

export function isPlausibleHvM2Unit(sample: HvCapacityM2Sample): boolean {
  return (
    sample.socPercent > HV_M2_MIN_SOC_PERCENT &&
    sample.socPercent <= HV_M2_MAX_SOC_PERCENT &&
    sample.currentEnergyKwh >= HV_M2_MIN_ENERGY_KWH &&
    sample.currentEnergyKwh <= HV_M2_MAX_ENERGY_KWH
  );
}

export function evaluateHvM2SampleGate(input: {
  sample: HvCapacityM2Sample;
  capacityBand: HvCapacityM2CapacityBand;
  seenObservedAtMs: Set<number>;
  providerOutcome: BatteryProviderObservationOutcome;
}): HvCapacityM2GateEvaluation {
  const reasonCodes: HvM2GateReasonCode[] = [];
  const { sample, capacityBand, seenObservedAtMs, providerOutcome } = input;

  const timestampDeltaMs = Math.abs(
    sample.socObservedAt.getTime() - sample.energyObservedAt.getTime(),
  );
  const preferredSocBand = isPreferredHvM2SocBand(sample.socPercent);

  if (sample.socPercent <= HV_M2_MIN_SOC_PERCENT) {
    reasonCodes.push(HV_M2_GATE_REASONS.SOC_NOT_POSITIVE);
  }
  if (!Number.isFinite(sample.currentEnergyKwh) || sample.currentEnergyKwh <= 0) {
    reasonCodes.push(HV_M2_GATE_REASONS.MISSING_ENERGY);
  }
  if (timestampDeltaMs > HV_M2_MAX_TIMESTAMP_DELTA_MS) {
    reasonCodes.push(HV_M2_GATE_REASONS.TIMESTAMP_SKEW);
  }
  if (seenObservedAtMs.has(sample.socObservedAt.getTime())) {
    reasonCodes.push(HV_M2_GATE_REASONS.DUPLICATE_TIMESTAMP);
  }
  if (BLOCKING_PROVIDER_OUTCOMES.has(providerOutcome)) {
    if (providerOutcome === 'STALE_REPLAY') {
      reasonCodes.push(HV_M2_GATE_REASONS.STALE_REPETITION);
    } else if (providerOutcome === 'DUPLICATE_OBSERVATION') {
      reasonCodes.push(HV_M2_GATE_REASONS.NOT_NEW_OBSERVATION);
    } else {
      reasonCodes.push(HV_M2_GATE_REASONS.NOT_NEW_OBSERVATION);
    }
  }
  if (!isPlausibleHvM2Unit(sample)) {
    reasonCodes.push(HV_M2_GATE_REASONS.IMPLAUSIBLE_UNIT);
  }

  const estimate = computeHvM2EstimatedCapacityKwh(
    sample.currentEnergyKwh,
    sample.socPercent,
  );
  if (
    estimate != null &&
    (estimate < capacityBand.minKwh || estimate > capacityBand.maxKwh)
  ) {
    reasonCodes.push(HV_M2_GATE_REASONS.OUT_OF_CAPACITY_BAND);
  }

  return {
    eligible: reasonCodes.length === 0,
    reasonCodes,
    timestampDeltaMs,
    preferredSocBand,
  };
}

export function filterHvM2NewProviderSamples(
  samples: HvCapacityM2Sample[],
): Array<{ sample: HvCapacityM2Sample; providerOutcome: BatteryProviderObservationOutcome }> {
  const accepted: Array<{
    sample: HvCapacityM2Sample;
    providerOutcome: BatteryProviderObservationOutcome;
  }> = [];

  let lastStored: {
    observedAt: Date;
    normalizedValue: number;
    receivedAt: Date | null;
  } | null = null;

  for (const sample of samples) {
    const receivedAt = sample.receivedAt ?? sample.socObservedAt;
    const decision = evaluateBatteryProviderObservation({
      organizationId: 'shadow',
      vehicleId: 'shadow',
      signalName: 'hv.soc_percent',
      providerSource: HV_M2_PROVIDER_SOURCE,
      normalizedValue: sample.socPercent,
      observedAt: sample.socObservedAt,
      receivedAt,
      lastStored: lastStored
        ? {
            observedAt: lastStored.observedAt,
            normalizedValue: lastStored.normalizedValue,
            receivedAt: lastStored.receivedAt,
          }
        : null,
    });

    if (decision.outcome === 'NEW_OBSERVATION') {
      accepted.push({ sample, providerOutcome: decision.outcome });
      lastStored = {
        observedAt: sample.socObservedAt,
        normalizedValue: sample.socPercent,
        receivedAt,
      };
      continue;
    }

    accepted.push({ sample, providerOutcome: decision.outcome });
  }

  return accepted;
}

export function buildHvM2PointEstimates(input: {
  samples: HvCapacityM2Sample[];
  capacityBand: HvCapacityM2CapacityBand;
}): HvCapacityM2PointEstimate[] {
  const providerFiltered = filterHvM2NewProviderSamples(input.samples);
  const seenObservedAtMs = new Set<number>();
  const preliminary: HvCapacityM2PointEstimate[] = [];

  for (const { sample, providerOutcome } of providerFiltered) {
    const gate = evaluateHvM2SampleGate({
      sample,
      capacityBand: input.capacityBand,
      seenObservedAtMs,
      providerOutcome,
    });
    seenObservedAtMs.add(sample.socObservedAt.getTime());

    if (!gate.eligible) continue;

    const valueKwh = computeHvM2EstimatedCapacityKwh(
      sample.currentEnergyKwh,
      sample.socPercent,
    );
    if (valueKwh == null || !Number.isFinite(valueKwh)) continue;

    preliminary.push({
      valueKwh,
      sample,
      gate,
      outlier: false,
    });
  }

  if (preliminary.length === 0) return [];

  const preferred = preliminary.filter((row) => row.gate.preferredSocBand);
  const medianSource = preferred.length > 0 ? preferred : preliminary;
  const sorted = [...medianSource].map((row) => row.valueKwh).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const sessionMedianKwh =
    sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];

  return preliminary.map((row) => {
    const deviation = Math.abs(row.valueKwh - sessionMedianKwh) / sessionMedianKwh;
    const outlier = deviation > HV_M2_OUTLIER_DEVIATION_RATIO;
    return {
      ...row,
      outlier,
      gate: outlier
        ? {
            ...row.gate,
            reasonCodes: [...row.gate.reasonCodes, HV_M2_GATE_REASONS.OUTLIER],
          }
        : row.gate,
    };
  });
}

export function resolveHvM2ObservationQuality(
  estimate: HvCapacityM2PointEstimate,
): BatteryMeasurementQuality {
  if (estimate.outlier) {
    return BatteryMeasurementQuality.INSUFFICIENT_COVERAGE;
  }
  return BatteryMeasurementQuality.SHADOW;
}

export function medianHvM2Estimates(estimates: HvCapacityM2PointEstimate[]): number | null {
  const preferred = estimates.filter(
    (row) => row.gate.preferredSocBand && !row.outlier,
  );
  const source = preferred.length > 0 ? preferred : estimates.filter((row) => !row.outlier);
  if (source.length === 0) return null;

  const sorted = source.map((row) => row.valueKwh).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}
