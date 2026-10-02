import { BatteryShutdownStateAlignmentClass } from '@prisma/client';
import {
  SHUTDOWN_TIMESTAMP_SOURCES,
  type ShutdownTimestampSource,
} from '../shutdown-evidence/shutdown-evidence.constants';
import {
  R1_NOMINAL_REST_CADENCE_MS,
  R1_RUNG_RESEARCH_TOLERANCE_CANDIDATE_MS,
  REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED,
  REST_CADENCE_POLICY_VERSION,
} from './generalized-evidence.constants';

const ANCHOR_MAX_AGE_MS = 3 * 60_000;

/** Midpoint between rung 0 and rung 1 (4h). Non-overlapping ladder partitions. */
const RUNG_0_UPPER_BOUND_MS = 4 * 60 * 60_000;

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
  rungResidualMs: number | null;
  cadenceInTolerance: boolean;
  restWakeCadenceQualified: boolean;
}

export function computeRungResidualMs(
  actualRestAgeMs: number,
  nominalRestIntervalIndex: number,
): number {
  return actualRestAgeMs - nominalRestIntervalIndex * R1_NOMINAL_REST_CADENCE_MS;
}

/**
 * Non-overlapping nominal index: rung k≥1 occupies
 * [ (k−½)×8h , (k+½)×8h ) with anchor rung 0 for age < 4h.
 */
export function deriveNominalRestIntervalIndex(actualRestAgeMs: number): {
  nominalRestIntervalIndex: number | null;
  rungResidualMs: number | null;
} {
  if (actualRestAgeMs <= ANCHOR_MAX_AGE_MS) {
    return { nominalRestIntervalIndex: 0, rungResidualMs: actualRestAgeMs };
  }

  if (actualRestAgeMs < RUNG_0_UPPER_BOUND_MS) {
    return {
      nominalRestIntervalIndex: 0,
      rungResidualMs: computeRungResidualMs(actualRestAgeMs, 0),
    };
  }

  for (let index = 1; index <= 21; index += 1) {
    const lowMs = (index - 0.5) * R1_NOMINAL_REST_CADENCE_MS;
    const highMs = (index + 0.5) * R1_NOMINAL_REST_CADENCE_MS;
    if (actualRestAgeMs >= lowMs && actualRestAgeMs < highMs) {
      return {
        nominalRestIntervalIndex: index,
        rungResidualMs: computeRungResidualMs(actualRestAgeMs, index),
      };
    }
  }

  return { nominalRestIntervalIndex: null, rungResidualMs: null };
}

/** Reserved for a future validated tolerance — not used for promotion in M3.3B.x. */
export function isRungResidualWithinResearchTolerance(rungResidualMs: number): boolean {
  return Math.abs(rungResidualMs) <= R1_RUNG_RESEARCH_TOLERANCE_CANDIDATE_MS;
}

/**
 * Shadow metric: ladder candidate (index≥1) not auto-promoted, or exceeds research tolerance candidate.
 * Reachable while REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED=false.
 */
export function shouldRecordCadenceLadderResearchUnqualified(
  result: Pick<
    RestCadenceQualificationResult,
    'nominalRestIntervalIndex' | 'rungResidualMs' | 'restWakeCadenceQualified'
  >,
): boolean {
  if (result.nominalRestIntervalIndex == null || result.nominalRestIntervalIndex < 1) {
    return false;
  }
  if (result.restWakeCadenceQualified) {
    return false;
  }
  if (!REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED) {
    return true;
  }
  if (result.rungResidualMs == null) {
    return true;
  }
  return !isRungResidualWithinResearchTolerance(result.rungResidualMs);
}

export function evaluateRestCadenceQualification(
  input: RestCadenceQualificationInput,
): RestCadenceQualificationResult {
  const base: RestCadenceQualificationResult = {
    tolerancePolicyVersion: REST_CADENCE_POLICY_VERSION,
    nominalRestIntervalIndex: null,
    rungResidualMs: null,
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
  if (mapped.nominalRestIntervalIndex == null || mapped.rungResidualMs == null) {
    return base;
  }

  const cadenceInTolerance = isRungResidualWithinResearchTolerance(mapped.rungResidualMs);

  const restWakeCadenceQualified =
    REST_CADENCE_AUTOMATIC_WAKE_PROMOTION_ENABLED &&
    mapped.nominalRestIntervalIndex >= 1 &&
    cadenceInTolerance;

  return {
    tolerancePolicyVersion: REST_CADENCE_POLICY_VERSION,
    nominalRestIntervalIndex: mapped.nominalRestIntervalIndex,
    rungResidualMs: mapped.rungResidualMs,
    cadenceInTolerance,
    restWakeCadenceQualified,
  };
}
