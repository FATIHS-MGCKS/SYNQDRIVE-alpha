import { BatteryMeasurementQuality } from '@prisma/client';
import { HV_SESSION_ADDED_ENERGY_RESET_MIN_KWH } from '../hv-charge-session/hv-charge-session-quality.assessor';
import { HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE } from '../hv-charge-session/hv-charge-session.types';
import {
  HV_M3_DEFAULT_CAPACITY_MAX_KWH,
  HV_M3_DEFAULT_CAPACITY_MIN_KWH,
  HV_M3_FIRST_LAST_DIVERGENCE_RATIO,
  HV_M3_GATE_REASONS,
  HV_M3_MAX_ADDED_ENERGY_KWH,
  HV_M3_METHOD_CONFLICT_DEVIATION_RATIO,
  HV_M3_MIN_ADDED_ENERGY_KWH,
  HV_M3_MIN_DELTA_SOC_PERCENT,
  type HvCapacityM3Estimate,
  type HvCapacityM3GateEvaluation,
  type HvCapacityM3SessionInput,
  type HvM3GateReasonCode,
} from './hv-capacity-m3.types';

export function computeHvM3EstimatedCapacityKwh(
  segmentAddedEnergyKwh: number,
  deltaSocPercent: number,
): number | null {
  if (!Number.isFinite(segmentAddedEnergyKwh) || !Number.isFinite(deltaSocPercent)) {
    return null;
  }
  if (segmentAddedEnergyKwh <= 0 || deltaSocPercent <= 0) return null;
  return segmentAddedEnergyKwh / (deltaSocPercent / 100);
}

function hasAddedEnergyReset(input: HvCapacityM3SessionInput): boolean {
  if (
    input.addedEnergyMinKwh != null &&
    input.addedEnergyMinKwh >= HV_SESSION_ADDED_ENERGY_RESET_MIN_KWH
  ) {
    return true;
  }
  return false;
}

function naiveFirstLastEnergyDelta(input: HvCapacityM3SessionInput): number | null {
  if (input.startEnergyKwh == null || input.endEnergyKwh == null) return null;
  return input.endEnergyKwh - input.startEnergyKwh;
}

export function evaluateHvM3SessionGate(
  input: HvCapacityM3SessionInput,
): HvCapacityM3GateEvaluation {
  const reasonCodes: HvM3GateReasonCode[] = [];

  if (input.isOngoing) {
    reasonCodes.push(HV_M3_GATE_REASONS.SESSION_ONGOING);
  }
  if (!input.capacityValidationEligible) {
    reasonCodes.push(HV_M3_GATE_REASONS.SESSION_NOT_VALIDATION_ELIGIBLE);
  }
  if (input.source !== HV_CHARGE_SESSION_SOURCE_DIMO_RECHARGE) {
    reasonCodes.push(HV_M3_GATE_REASONS.NON_DIMO_SEGMENT_SOURCE);
  }
  if (input.boundaryStrength === 'weak' || input.boundaryStrength === 'invalid') {
    reasonCodes.push(HV_M3_GATE_REASONS.WEAK_SESSION_BOUNDARIES);
  }
  if (!input.endAt) {
    reasonCodes.push(HV_M3_GATE_REASONS.SESSION_ONGOING);
  }

  const deltaSoc = input.deltaSocPercent ?? 0;
  if (deltaSoc < HV_M3_MIN_DELTA_SOC_PERCENT) {
    reasonCodes.push(HV_M3_GATE_REASONS.INSUFFICIENT_SOC_DELTA);
  }

  const segmentAddedEnergy = input.energyAddedKwh;
  if (segmentAddedEnergy == null || !Number.isFinite(segmentAddedEnergy)) {
    reasonCodes.push(HV_M3_GATE_REASONS.MISSING_SEGMENT_AGGREGATE);
  } else if (
    segmentAddedEnergy < HV_M3_MIN_ADDED_ENERGY_KWH ||
    segmentAddedEnergy > HV_M3_MAX_ADDED_ENERGY_KWH
  ) {
    reasonCodes.push(HV_M3_GATE_REASONS.IMPLAUSIBLE_ADDED_ENERGY);
  }

  if (hasAddedEnergyReset(input)) {
    reasonCodes.push(HV_M3_GATE_REASONS.ADDED_ENERGY_RESET);
  }

  const naiveDelta = naiveFirstLastEnergyDelta(input);
  if (
    segmentAddedEnergy != null &&
    naiveDelta != null &&
    segmentAddedEnergy > 0 &&
    Math.abs(naiveDelta - segmentAddedEnergy) / segmentAddedEnergy >
      HV_M3_FIRST_LAST_DIVERGENCE_RATIO
  ) {
    reasonCodes.push(HV_M3_GATE_REASONS.FIRST_LAST_DIVERGENCE);
  }

  const estimate = computeHvM3EstimatedCapacityKwh(
    segmentAddedEnergy ?? 0,
    deltaSoc,
  );
  if (
    estimate != null &&
    (estimate < HV_M3_DEFAULT_CAPACITY_MIN_KWH ||
      estimate > HV_M3_DEFAULT_CAPACITY_MAX_KWH)
  ) {
    reasonCodes.push(HV_M3_GATE_REASONS.OUT_OF_CAPACITY_BAND);
  }

  return {
    eligible: reasonCodes.length === 0,
    reasonCodes,
  };
}

export function detectHvM3MethodConflict(input: {
  m3CapacityKwh: number;
  m2MedianCapacityKwh: number | null;
}): { conflict: boolean; deviationRatio: number | null } {
  if (input.m2MedianCapacityKwh == null || input.m2MedianCapacityKwh <= 0) {
    return { conflict: false, deviationRatio: null };
  }

  const deviationRatio =
    Math.abs(input.m3CapacityKwh - input.m2MedianCapacityKwh) /
    input.m2MedianCapacityKwh;

  return {
    conflict: deviationRatio > HV_M3_METHOD_CONFLICT_DEVIATION_RATIO,
    deviationRatio,
  };
}

export function buildHvM3Estimate(input: {
  session: HvCapacityM3SessionInput;
  m2MedianCapacityKwh?: number | null;
}): HvCapacityM3Estimate | null {
  const gate = evaluateHvM3SessionGate(input.session);
  if (!gate.eligible) return null;

  const segmentAddedEnergyKwh = input.session.energyAddedKwh as number;
  const deltaSocPercent = input.session.deltaSocPercent as number;
  const estimatedCapacityKwh = computeHvM3EstimatedCapacityKwh(
    segmentAddedEnergyKwh,
    deltaSocPercent,
  );
  if (estimatedCapacityKwh == null) return null;

  const conflict = detectHvM3MethodConflict({
    m3CapacityKwh: estimatedCapacityKwh,
    m2MedianCapacityKwh: input.m2MedianCapacityKwh ?? null,
  });

  const reasonCodes = [...gate.reasonCodes];
  if (conflict.conflict) {
    reasonCodes.push(HV_M3_GATE_REASONS.METHOD_CONFLICT_WITH_M2);
  }

  return {
    estimatedCapacityKwh,
    segmentAddedEnergyKwh,
    deltaSocPercent,
    gate: {
      eligible: true,
      reasonCodes,
    },
    methodConflict: conflict.conflict,
    methodConflictDeviationRatio: conflict.deviationRatio,
    m2MedianCapacityKwh: input.m2MedianCapacityKwh ?? null,
  };
}

export function resolveHvM3ObservationQuality(
  estimate: HvCapacityM3Estimate,
): BatteryMeasurementQuality {
  if (estimate.methodConflict) {
    return BatteryMeasurementQuality.INSUFFICIENT_COVERAGE;
  }
  return BatteryMeasurementQuality.VALID_PROXY;
}
