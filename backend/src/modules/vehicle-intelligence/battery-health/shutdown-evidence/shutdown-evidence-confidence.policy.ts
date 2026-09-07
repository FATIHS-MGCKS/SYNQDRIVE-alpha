import {
  BatteryShutdownEvidenceClass,
  BatteryShutdownEvidenceConfidenceClass,
  BatteryShutdownStateAlignmentClass,
  BatteryShutdownStateCompleteness,
} from '@prisma/client';

export interface ShutdownConfidenceInput {
  evidenceClass: BatteryShutdownEvidenceClass;
  stateCompleteness: BatteryShutdownStateCompleteness;
  stateAlignmentClass: BatteryShutdownStateAlignmentClass;
}

/**
 * Discrete explainable confidence tiers — shadow metadata only.
 */
export function resolveShutdownEvidenceConfidence(
  input: ShutdownConfidenceInput,
): BatteryShutdownEvidenceConfidenceClass {
  if (input.stateCompleteness === BatteryShutdownStateCompleteness.MISSING) {
    return BatteryShutdownEvidenceConfidenceClass.INSUFFICIENT;
  }

  if (
    input.evidenceClass === BatteryShutdownEvidenceClass.UNKNOWN_STATE ||
    input.evidenceClass === BatteryShutdownEvidenceClass.STALE_OR_SKEWED_STATE
  ) {
    return BatteryShutdownEvidenceConfidenceClass.INSUFFICIENT;
  }

  if (input.evidenceClass === BatteryShutdownEvidenceClass.POST_ENGINE_OFF_PRE_SLEEP) {
    if (
      input.stateCompleteness === BatteryShutdownStateCompleteness.COMPLETE &&
      input.stateAlignmentClass === BatteryShutdownStateAlignmentClass.ALIGNED
    ) {
      return BatteryShutdownEvidenceConfidenceClass.HIGH;
    }
    if (input.stateAlignmentClass === BatteryShutdownStateAlignmentClass.PARTIAL) {
      return BatteryShutdownEvidenceConfidenceClass.MEDIUM;
    }
    return BatteryShutdownEvidenceConfidenceClass.LOW;
  }

  if (input.evidenceClass === BatteryShutdownEvidenceClass.SHUTDOWN_TRANSITION) {
    if (input.stateCompleteness === BatteryShutdownStateCompleteness.COMPLETE) {
      return BatteryShutdownEvidenceConfidenceClass.MEDIUM;
    }
    return BatteryShutdownEvidenceConfidenceClass.LOW;
  }

  if (
    input.evidenceClass === BatteryShutdownEvidenceClass.ACTIVE_ALTERNATOR ||
    input.evidenceClass === BatteryShutdownEvidenceClass.ACTIVE_NON_CHARGING
  ) {
    return BatteryShutdownEvidenceConfidenceClass.MEDIUM;
  }

  return BatteryShutdownEvidenceConfidenceClass.INSUFFICIENT;
}
