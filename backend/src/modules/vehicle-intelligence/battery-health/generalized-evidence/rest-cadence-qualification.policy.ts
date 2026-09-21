import { BatteryShutdownStateAlignmentClass } from '@prisma/client';
import { SHUTDOWN_TIMESTAMP_SOURCES, type ShutdownTimestampSource } from '../shutdown-evidence/shutdown-evidence.constants';
import {
  R1_NOMINAL_REST_CADENCE_MS,
  REST_CADENCE_POLICY_VERSION,
} from './generalized-evidence.constants';

/** Production forensic parked-rest inter-arrival P25 (2026-09-21, ICE LTE_R1). */
export const R1_PARKED_REST_DELTA_P25_MS = 17_457_000;

/** Production forensic parked-rest inter-arrival median. */
export const R1_PARKED_REST_DELTA_MEDIAN_MS = 28_890_000;

/** Production forensic parked-rest inter-arrival P95. */
export const R1_PARKED_REST_DELTA_P95_MS = 38_726_000;

/** Production forensic min inter-arrival in 4–12h candidate band. */
export const R1_PARKED_REST_DELTA_MIN_MS = 14_619_000;

/** Production forensic max inter-arrival in 4–12h candidate band. */
export const R1_PARKED_REST_DELTA_MAX_MS = 39_872_000;

/** Center tolerance — half-width from nominal ladder rung (derived from P95−median spread). */
export const R1_CADENCE_CENTER_TOLERANCE_MS = 4.5 * 60 * 60_000;

const ANCHOR_MAX_AGE_MS = 3 * 60_000;

export interface RestCadenceQualificationInput {
  actualRestAgeMs: number | null | undefined;
  voltageTimestampSource: ShutdownTimestampSource;
  providerObservationOutcome?: string | null;
  stateAlignmentClass: BatteryShutdownStateAlignmentClass;
  hasActiveRestSession: boolean;
}

export interface RestCadenceQualificationResult {
  tolerancePolicyVersion: string;
  nominalRestIntervalIndex: number | null;
  cadenceInTolerance: boolean;
  restWakeCadenceQualified: boolean;
}

function restAgeBandForNominalIndex(index: number): { minMs: number; maxMs: number } {
  if (index <= 0) {
    return { minMs: 0, maxMs: ANCHOR_MAX_AGE_MS };
  }
  if (index === 1) {
    return {
      minMs: 4 * 60 * 60_000,
      maxMs: 12 * 60 * 60_000,
    };
  }
  const center = index * R1_NOMINAL_REST_CADENCE_MS;
  return {
    minMs: center - 4 * 60 * 60_000,
    maxMs: center + 4.5 * 60 * 60_000,
  };
}

/**
 * Maps provider-authoritative rest age to a nominal ladder index (metadata only).
 * Supports skipped rungs (e.g. first observation at ~16h → index 2).
 */
export function deriveNominalRestIntervalIndex(
  actualRestAgeMs: number,
): { nominalRestIntervalIndex: number | null; cadenceInTolerance: boolean } {
  if (actualRestAgeMs <= ANCHOR_MAX_AGE_MS) {
    return { nominalRestIntervalIndex: 0, cadenceInTolerance: true };
  }

  for (let index = 21; index >= 1; index -= 1) {
    const { minMs, maxMs } = restAgeBandForNominalIndex(index);
    if (actualRestAgeMs >= minMs && actualRestAgeMs <= maxMs) {
      const center = index * R1_NOMINAL_REST_CADENCE_MS;
      const cadenceInTolerance =
        Math.abs(actualRestAgeMs - center) <= R1_CADENCE_CENTER_TOLERANCE_MS;
      return { nominalRestIntervalIndex: index, cadenceInTolerance };
    }
  }

  return { nominalRestIntervalIndex: null, cadenceInTolerance: false };
}

export function evaluateRestCadenceQualification(
  input: RestCadenceQualificationInput,
): RestCadenceQualificationResult {
  const base = {
    tolerancePolicyVersion: REST_CADENCE_POLICY_VERSION,
    nominalRestIntervalIndex: null as number | null,
    cadenceInTolerance: false,
    restWakeCadenceQualified: false,
  };

  if (
    input.actualRestAgeMs == null ||
    input.actualRestAgeMs < 0 ||
    !input.hasActiveRestSession
  ) {
    return base;
  }

  if (input.voltageTimestampSource !== SHUTDOWN_TIMESTAMP_SOURCES.PROVIDER_FIELD_TIMESTAMP) {
    return base;
  }

  if (input.providerObservationOutcome === 'STALE_REPLAY') {
    return base;
  }

  const alignmentOk =
    input.stateAlignmentClass === BatteryShutdownStateAlignmentClass.ALIGNED ||
    input.stateAlignmentClass === BatteryShutdownStateAlignmentClass.PARTIAL;
  if (!alignmentOk) {
    return base;
  }

  const mapped = deriveNominalRestIntervalIndex(input.actualRestAgeMs);
  const restWakeCadenceQualified =
    mapped.nominalRestIntervalIndex != null &&
    mapped.nominalRestIntervalIndex >= 1 &&
    mapped.cadenceInTolerance;

  return {
    tolerancePolicyVersion: REST_CADENCE_POLICY_VERSION,
    nominalRestIntervalIndex: mapped.nominalRestIntervalIndex,
    cadenceInTolerance: mapped.cadenceInTolerance,
    restWakeCadenceQualified,
  };
}
